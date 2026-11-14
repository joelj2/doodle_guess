import express from 'express';
import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type {
  AvatarConfig,
  DrawAction,
  RoomSettings,
} from './src/shared/types.ts';
import { buildHintPattern } from './src/shared/words.ts';
import {
  advanceRoomClock,
  beginWordChoiceOnRoom,
  buildStateForPlayer,
  computeTimeLeft,
  createRoomObject,
  defaultAvatar,
  deleteRoom,
  getInMemoryRoomsMap,
  getNextHintIn,
  getPublicRoomsList,
  getRoom,
  makeId,
  markSocketServerActive,
  processGuessOrChat,
  pushSystemMessage,
  removePlayerFromRoom,
  sanitizeName,
  sanitizeSettings,
  saveRoom,
  startDrawingPhaseOnRoom,
} from './src/server/gameEngine.ts';
import type { ServerRoom } from './src/server/gameEngine.ts';

const PORT = Number(process.env.PORT) || 3000;
const socketRoomMap = new Map<string, string>();
const roomTimers = new Map<string, ReturnType<typeof setInterval>>();
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function startServer() {
  markSocketServerActive();

  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  async function broadcastPublicRooms() {
    io.emit('rooms:updated', await getPublicRoomsList());
  }

  function syncRoomToAll(room: ServerRoom) {
    const now = Date.now();
    for (const player of room.players) {
      if (!player.connected || player.isHttp) continue;
      io.to(player.id).emit('room:state', buildStateForPlayer(room, player.id, now));
    }
  }

  function stopRoomLoop(code: string) {
    const handle = roomTimers.get(code);
    if (handle) {
      clearInterval(handle);
      roomTimers.delete(code);
    }
  }

  function ensureRoomLoop(room: ServerRoom) {
    if (roomTimers.has(room.code)) return;

    const handle = setInterval(async () => {
      const current = getInMemoryRoomsMap().get(room.code);
      if (!current || current.phase === 'LOBBY' || current.phase === 'GAME_OVER') {
        stopRoomLoop(room.code);
        return;
      }

      const now = Date.now();
      const { revealedHint, phaseChanged } = advanceRoomClock(current, now);

      if (revealedHint && current.secretWord) {
        const nextHintIn = getNextHintIn(current, now);
        const guesserPattern = buildHintPattern(current.secretWord, current.revealedIndices);
        for (const p of current.players) {
          if (!p.connected || p.isHttp) continue;
          const seesWord = p.id === current.drawerId || p.hasGuessed;
          io.to(p.id).emit('hint:revealed', {
            hintPattern: seesWord ? current.secretWord.toUpperCase() : guesserPattern,
            revealedIndices: current.revealedIndices,
            nextHintIn,
          });
        }
        const lastMsg = current.messages[current.messages.length - 1];
        if (lastMsg?.kind === 'hint') {
          io.to(current.code).emit('chat:message', lastMsg);
        }
      }

      if (phaseChanged) {
        syncRoomToAll(current);
        await broadcastPublicRooms();
        const afterPhase: string = current.phase;
        if (afterPhase === 'LOBBY' || afterPhase === 'GAME_OVER') {
          stopRoomLoop(current.code);
        }
      } else {
        io.to(current.code).emit('timer:tick', {
          timeLeft: computeTimeLeft(current, now),
          nextHintIn: getNextHintIn(current, now),
        });
      }
    }, 1000);

    roomTimers.set(room.code, handle);
  }

  async function handlePlayerLeave(socketId: string) {
    const code = socketRoomMap.get(socketId);
    if (!code) return;
    socketRoomMap.delete(socketId);

    const room = await getRoom(code);
    if (!room) return;

    const player = room.players.find((p) => p.id === socketId);
    const wasVoice = Boolean(player?.voiceJoined);

    const { empty, phaseChanged } = removePlayerFromRoom(room, socketId);

    if (wasVoice) {
      io.to(room.code).emit('voice:peerLeft', { peerId: socketId });
    }

    if (empty) {
      stopRoomLoop(room.code);
      const t = setTimeout(async () => {
        const current = await getRoom(code);
        if (current && current.players.filter((p) => p.connected).length === 0) {
          stopRoomLoop(code);
          await deleteRoom(code);
          await broadcastPublicRooms();
        }
      }, 15000);
      cleanupTimers.set(code, t);
      await broadcastPublicRooms();
      return;
    }

    if (phaseChanged) {
      ensureRoomLoop(room);
    }
    syncRoomToAll(room);
    await saveRoom(room);
    await broadcastPublicRooms();
  }

  io.on('connection', async (socket: Socket) => {
    socket.emit('rooms:updated', await getPublicRoomsList());

    socket.on(
      'room:create',
      async (
        payload: { name: string; avatar?: AvatarConfig; settings?: Partial<RoomSettings> },
        ack?: (res: { ok: boolean; code?: string; error?: string }) => void
      ) => {
        if (socketRoomMap.has(socket.id)) {
          const prev = socketRoomMap.get(socket.id) ?? '';
          await handlePlayerLeave(socket.id);
          socket.leave(prev);
        }

        const room = createRoomObject(
          socket.id,
          payload?.name ?? '',
          payload?.avatar,
          payload?.settings,
          false
        );

        await saveRoom(room);
        socketRoomMap.set(socket.id, room.code);
        socket.join(room.code);

        socket.emit('room:state', buildStateForPlayer(room, socket.id));
        await broadcastPublicRooms();
        ack?.({ ok: true, code: room.code });
      }
    );

    socket.on(
      'room:join',
      async (
        payload: { code: string; name: string; avatar?: AvatarConfig },
        ack?: (res: { ok: boolean; code?: string; error?: string }) => void
      ) => {
        const code = String(payload?.code ?? '')
          .trim()
          .toUpperCase();
        const room = await getRoom(code);

        if (!room) {
          ack?.({ ok: false, error: `Room "${code}" not found.` });
          return;
        }

        const pendingCleanup = cleanupTimers.get(code);
        if (pendingCleanup) {
          clearTimeout(pendingCleanup);
          cleanupTimers.delete(code);
        }

        if (room.players.length >= room.settings.maxPlayers) {
          ack?.({ ok: false, error: 'This room is already full.' });
          return;
        }

        if (socketRoomMap.has(socket.id)) {
          const prevCode = socketRoomMap.get(socket.id);
          if (prevCode === code) {
            socket.emit('room:state', buildStateForPlayer(room, socket.id));
            ack?.({ ok: true, code });
            return;
          }
          await handlePlayerLeave(socket.id);
        }

        const isFirst = room.players.length === 0;
        const playerName = sanitizeName(payload?.name ?? '');
        const now = Date.now();

        room.players.push({
          id: socket.id,
          name: playerName,
          avatar: payload?.avatar ?? defaultAvatar(),
          score: 0,
          roundScore: 0,
          hasGuessed: false,
          guessOrder: null,
          isDrawing: false,
          isHost: isFirst,
          connected: true,
          voiceJoined: false,
          voiceMuted: false,
          isSpeaking: false,
          lastSeen: now,
          isHttp: false,
        });

        socketRoomMap.set(socket.id, code);
        socket.join(code);

        pushSystemMessage(room, `${playerName} joined the room!`);
        await saveRoom(room);
        syncRoomToAll(room);
        await broadcastPublicRooms();
        ack?.({ ok: true, code });
      }
    );

    socket.on('room:leave', async () => {
      const code = socketRoomMap.get(socket.id);
      if (code) {
        socket.leave(code);
        await handlePlayerLeave(socket.id);
      }
    });

    socket.on('room:updateSettings', async (partial: Partial<RoomSettings>) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player?.isHost || room.phase !== 'LOBBY') return;

      room.settings = sanitizeSettings({ ...room.settings, ...partial });
      await saveRoom(room);
      syncRoomToAll(room);
      await broadcastPublicRooms();
    });

    socket.on('game:start', async (ack?: (res: { ok: boolean; error?: string }) => void) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player?.isHost) {
        ack?.({ ok: false, error: 'Only the room host can start the match.' });
        return;
      }
      const connectedPlayers = room.players.filter((p) => p.connected);
      if (connectedPlayers.length < 2) {
        ack?.({ ok: false, error: 'Need at least 2 players to start a competitive match.' });
        return;
      }

      for (const p of room.players) {
        p.score = 0;
        p.roundScore = 0;
        p.hasGuessed = false;
        p.guessOrder = null;
        p.isDrawing = false;
      }

      room.currentRound = 1;
      room.usedWords = [];
      room.drawerOrder = connectedPlayers.map((p) => p.id);
      room.drawerQueueIdx = 0;
      room.strokes = [];
      room.redoStack = [];
      room.roundSummary = null;

      beginWordChoiceOnRoom(room);
      await saveRoom(room);
      ensureRoomLoop(room);
      syncRoomToAll(room);
      await broadcastPublicRooms();
      ack?.({ ok: true });
    });

    socket.on('game:playAgain', async () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player?.isHost) return;

      stopRoomLoop(room.code);
      for (const p of room.players) {
        p.score = 0;
        p.roundScore = 0;
        p.hasGuessed = false;
        p.guessOrder = null;
        p.isDrawing = false;
      }
      room.phase = 'LOBBY';
      room.currentRound = 0;
      room.drawerId = null;
      room.secretWord = null;
      room.phaseEndsAt = 0;
      room.totalTime = 0;
      room.strokes = [];
      room.redoStack = [];
      room.roundSummary = null;
      pushSystemMessage(room, 'Room reset to lobby for a rematch!');
      await saveRoom(room);
      syncRoomToAll(room);
      await broadcastPublicRooms();
    });

    socket.on('word:select', async (word: string) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room || room.phase !== 'CHOOSING_WORD' || room.drawerId !== socket.id) return;

      const validOption = room.wordOptions.find((o) => o.word === word);
      const chosen = validOption ? validOption.word : room.wordOptions[0]?.word;
      if (chosen) {
        startDrawingPhaseOnRoom(room, chosen);
        await saveRoom(room);
        ensureRoomLoop(room);
        syncRoomToAll(room);
      }
    });

    socket.on('draw:action', async (action: DrawAction) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;

      const canDraw =
        (room.phase === 'DRAWING' && room.drawerId === socket.id) || room.phase === 'LOBBY';
      if (!canDraw) return;

      if (action.type === 'clear') {
        room.strokes = [];
        room.redoStack = [];
        await saveRoom(room);
        io.to(room.code).emit('canvas:sync', {
          strokes: room.strokes,
          canUndo: false,
          canRedo: false,
        });
        return;
      }

      if (room.strokes.some((s) => s.id === action.id)) return;

      room.strokes.push(action);
      room.redoStack = [];
      await saveRoom(room);
      socket.to(room.code).emit('draw:action', action);
      io.to(room.code).emit('canvas:historyState', {
        canUndo: room.strokes.length > 0,
        canRedo: false,
      });
    });

    socket.on('draw:undo', async () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;

      const canDraw =
        (room.phase === 'DRAWING' && room.drawerId === socket.id) || room.phase === 'LOBBY';
      if (!canDraw || room.strokes.length === 0) return;

      const last = room.strokes.pop();
      if (last) room.redoStack.push(last);
      await saveRoom(room);
      io.to(room.code).emit('canvas:sync', {
        strokes: room.strokes,
        canUndo: room.strokes.length > 0,
        canRedo: room.redoStack.length > 0,
      });
    });

    socket.on('draw:redo', async () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;

      const canDraw =
        (room.phase === 'DRAWING' && room.drawerId === socket.id) || room.phase === 'LOBBY';
      if (!canDraw || room.redoStack.length === 0) return;

      const restored = room.redoStack.pop();
      if (restored) room.strokes.push(restored);
      await saveRoom(room);
      io.to(room.code).emit('canvas:sync', {
        strokes: room.strokes,
        canUndo: room.strokes.length > 0,
        canRedo: room.redoStack.length > 0,
      });
    });

    socket.on('canvas:reaction', async (emoji: string) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;
      const allowed = ['👍', '🔥', '😂', '😮', '👏', '🎨'];
      if (!allowed.includes(emoji)) return;

      io.to(room.code).emit('canvas:reaction', {
        id: makeId('react'),
        emoji,
        playerName: player.name,
        xRatio: 0.12 + Math.random() * 0.76,
      });
    });

    socket.on('chat:guess', async (rawText: string) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;

      const result = processGuessOrChat(room, socket.id, rawText);
      if (!result.message) return;

      if (result.type === 'private_to_sender') {
        socket.emit('chat:message', result.message);
        return;
      }

      if (result.type === 'private_to_guessers') {
        for (const p of room.players) {
          if (p.connected && !p.isHttp && (p.hasGuessed || p.id === room.drawerId)) {
            io.to(p.id).emit('chat:message', result.message);
          }
        }
        return;
      }

      if (result.type === 'broadcast') {
        await saveRoom(room);
        io.to(room.code).emit('chat:message', result.message);
        return;
      }

      if (result.type === 'correct') {
        await saveRoom(room);
        io.to(room.code).emit('chat:message', result.message);
        socket.emit('guess:accepted', {
          word: result.acceptedWord,
          points: result.points,
          hintPattern: (result.acceptedWord ?? '').toUpperCase(),
        });
        io.to(room.code).emit('players:updated', room.players);
        if (result.allGuessed) {
          syncRoomToAll(room);
        }
      }
    });

    socket.on('voice:join', async () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.voiceJoined = true;
      player.voiceMuted = false;
      player.isSpeaking = false;

      const activePeerIds = room.players
        .filter((p) => p.connected && p.voiceJoined && p.id !== socket.id)
        .map((p) => p.id);

      await saveRoom(room);
      socket.emit('voice:peers', { peerIds: activePeerIds });
      socket.to(room.code).emit('voice:peerJoined', { peerId: socket.id });
      io.to(room.code).emit('players:updated', room.players);
    });

    socket.on('voice:leave', async () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.voiceJoined = false;
      player.voiceMuted = false;
      player.isSpeaking = false;

      await saveRoom(room);
      socket.to(room.code).emit('voice:peerLeft', { peerId: socket.id });
      io.to(room.code).emit('players:updated', room.players);
    });

    socket.on('voice:mute', async (muted: boolean) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.voiceMuted = Boolean(muted);
      if (player.voiceMuted) player.isSpeaking = false;
      await saveRoom(room);
      io.to(room.code).emit('players:updated', room.players);
    });

    socket.on('voice:speaking', async (speaking: boolean) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = await getRoom(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || !player.voiceJoined) return;

      const next = player.voiceMuted ? false : Boolean(speaking);
      if (player.isSpeaking === next) return;
      player.isSpeaking = next;
      io.to(room.code).emit('voice:speakingState', { playerId: socket.id, isSpeaking: next });
    });

    socket.on(
      'voice:signal',
      async (payload: {
        to: string;
        description?: Record<string, unknown>;
        candidate?: Record<string, unknown>;
      }) => {
        const code = socketRoomMap.get(socket.id);
        if (!code || !payload?.to) return;
        const room = await getRoom(code);
        if (!room) return;
        const targetExists = room.players.some((p) => p.id === payload.to && p.connected);
        if (!targetExists) return;

        io.to(payload.to).emit('voice:signal', {
          from: socket.id,
          description: payload.description,
          candidate: payload.candidate,
        });
      }
    );

    socket.on('disconnect', async () => {
      await handlePlayerLeave(socket.id);
    });
  });

  const dev = process.env.NODE_ENV !== 'production';
  const nextApp = next({ dev, hostname: '0.0.0.0', port: PORT });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();

  app.use((req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`DoodleGuess Next.js server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
