import express from 'express';
import { createServer } from 'node:http';
import next from 'next';
import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type {
  AvatarConfig,
  ChatMessage,
  DrawAction,
  GamePhase,
  Player,
  PublicRoomSummary,
  RoomSettings,
  RoomStateSync,
  RoundPlayerResult,
  RoundSummary,
  WordOption,
} from './src/shared/types.ts';
import {
  WORD_BANK,
  buildHintPattern,
  getRevealableIndices,
  isCloseGuess,
  isExactWordMatch,
} from './src/shared/words.ts';

const PORT = Number(process.env.PORT) || 3000;
const WORD_CHOICE_SECONDS = 15;
const ROUND_END_SECONDS = 6;

interface ServerRoom {
  code: string;
  settings: RoomSettings;
  phase: GamePhase;
  players: Player[];
  currentRound: number;
  drawerOrder: string[];
  drawerQueueIdx: number;
  drawerId: string | null;
  secretWord: string | null;
  wordOptions: WordOption[];
  usedWords: Set<string>;
  timeLeft: number;
  totalTime: number;
  revealedIndices: number[];
  hintTriggers: number[];
  strokes: DrawAction[];
  redoStack: DrawAction[];
  messages: ChatMessage[];
  roundSummary: RoundSummary | null;
  guessTimes: Map<string, number>;
  timerHandle: ReturnType<typeof setInterval> | null;
  cleanupTimeout: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, ServerRoom>();
const socketRoomMap = new Map<string, string>();

function makeId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sanitizeName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, 18);
  return cleaned || `Artist${Math.floor(100 + Math.random() * 899)}`;
}

function defaultAvatar(): AvatarConfig {
  return {
    color: '#2563EB',
    face: 'happy',
    accessory: 'none',
  };
}

function sanitizeSettings(partial?: Partial<RoomSettings>): RoomSettings {
  const rounds = Math.min(8, Math.max(1, Number(partial?.rounds) || 3));
  const drawTime = Math.min(180, Math.max(30, Number(partial?.drawTime) || 80));
  const maxPlayers = Math.min(12, Math.max(2, Number(partial?.maxPlayers) || 8));
  const hintCount = Math.min(5, Math.max(0, partial?.hintCount ?? 3));
  const wordMode =
    partial?.wordMode === 'custom' || partial?.wordMode === 'mixed' || partial?.wordMode === 'standard'
      ? partial.wordMode
      : 'standard';
  const customWords = Array.isArray(partial?.customWords)
    ? partial.customWords
        .map((w) => String(w).trim().replace(/\s+/g, ' '))
        .filter((w) => w.length >= 2 && w.length <= 36)
        .slice(0, 100)
    : [];
  const isPublic = typeof partial?.isPublic === 'boolean' ? partial.isPublic : true;

  return {
    rounds,
    drawTime,
    maxPlayers,
    hintCount,
    wordMode,
    customWords,
    isPublic,
  };
}

function computeHintTriggers(drawTime: number, hintCount: number, word: string): number[] {
  if (hintCount <= 0) return [];
  const revealable = getRevealableIndices(word);
  // Keep at least ~45% of letters unrevealed so guessing remains fun
  const maxToReveal = Math.min(hintCount, Math.max(1, Math.floor(revealable.length * 0.55)));
  const triggers: number[] = [];
  for (let i = 1; i <= maxToReveal; i++) {
    const elapsedFraction = i / (maxToReveal + 1.15);
    const triggerAtLeft = Math.max(5, Math.round(drawTime * (1 - elapsedFraction)));
    if (!triggers.includes(triggerAtLeft)) {
      triggers.push(triggerAtLeft);
    }
  }
  return triggers.sort((a, b) => b - a);
}

function getNextHintIn(room: ServerRoom): number | null {
  if (room.phase !== 'DRAWING') return null;
  const upcoming = room.hintTriggers.find((t) => t < room.timeLeft);
  if (upcoming === undefined) return null;
  return Math.max(1, room.timeLeft - upcoming);
}

function buildStateForPlayer(room: ServerRoom, playerId: string): RoomStateSync {
  const player = room.players.find((p) => p.id === playerId);
  const isDrawer = room.drawerId === playerId;
  const canSeeWord =
    isDrawer ||
    Boolean(player?.hasGuessed) ||
    room.phase === 'ROUND_END' ||
    room.phase === 'GAME_OVER';

  const hintPattern = room.secretWord
    ? canSeeWord
      ? room.secretWord.toUpperCase()
      : buildHintPattern(room.secretWord, room.revealedIndices)
    : '';

  const drawer = room.players.find((p) => p.id === room.drawerId);

  return {
    code: room.code,
    settings: room.settings,
    phase: room.phase,
    players: room.players,
    currentRound: room.currentRound,
    totalRounds: room.settings.rounds,
    drawerId: room.drawerId,
    drawerName: drawer?.name ?? null,
    timeLeft: room.timeLeft,
    totalTime: room.totalTime,
    hintPattern,
    revealedIndices: room.revealedIndices,
    nextHintIn: getNextHintIn(room),
    wordOptions: isDrawer && room.phase === 'CHOOSING_WORD' ? room.wordOptions : null,
    secretWord: canSeeWord ? room.secretWord : null,
    strokes: room.strokes,
    messages: room.messages.slice(-80),
    roundSummary: room.roundSummary,
    canUndo: room.strokes.length > 0,
    canRedo: room.redoStack.length > 0,
  };
}

function getPublicRoomsList(): PublicRoomSummary[] {
  const list: PublicRoomSummary[] = [];
  for (const room of rooms.values()) {
    if (!room.settings.isPublic) continue;
    const connectedCount = room.players.filter((p) => p.connected).length;
    if (connectedCount === 0) continue;
    const host = room.players.find((p) => p.isHost) ?? room.players[0];
    list.push({
      code: room.code,
      hostName: host?.name ?? 'Host',
      playerCount: connectedCount,
      maxPlayers: room.settings.maxPlayers,
      phase: room.phase,
      currentRound: room.currentRound,
      totalRounds: room.settings.rounds,
    });
  }
  return list.sort((a, b) => b.playerCount - a.playerCount);
}

function pickWordOptions(room: ServerRoom): WordOption[] {
  const customPool: WordOption[] = room.settings.customWords.map((w) => ({
    word: w,
    category: 'Custom',
  }));

  let pool: WordOption[] = [];
  if (room.settings.wordMode === 'custom' && customPool.length >= 3) {
    pool = customPool;
  } else if (room.settings.wordMode === 'mixed' && customPool.length > 0) {
    pool = [...customPool, ...WORD_BANK];
  } else {
    pool = WORD_BANK;
  }

  let available = pool.filter((item) => !room.usedWords.has(item.word.toLowerCase()));
  if (available.length < 3) {
    room.usedWords.clear();
    available = [...pool];
  }

  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: '*' },
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getPublicRoomsList() });
  });

  function broadcastPublicRooms() {
    io.emit('rooms:updated', getPublicRoomsList());
  }

  function pushSystemMessage(room: ServerRoom, text: string, kind: ChatMessage['kind'] = 'system') {
    const msg: ChatMessage = {
      id: makeId('msg'),
      text,
      kind,
      timestamp: Date.now(),
    };
    room.messages.push(msg);
    if (room.messages.length > 120) {
      room.messages = room.messages.slice(-100);
    }
    io.to(room.code).emit('chat:message', msg);
  }

  function syncRoomToAll(room: ServerRoom) {
    for (const player of room.players) {
      if (!player.connected) continue;
      io.to(player.id).emit('room:state', buildStateForPlayer(room, player.id));
    }
  }

  function clearRoomTimer(room: ServerRoom) {
    if (room.timerHandle) {
      clearInterval(room.timerHandle);
      room.timerHandle = null;
    }
  }

  function beginWordChoice(room: ServerRoom) {
    clearRoomTimer(room);

    const connectedPlayers = room.players.filter((p) => p.connected);
    if (connectedPlayers.length < 2) {
      room.phase = 'LOBBY';
      room.drawerId = null;
      room.secretWord = null;
      room.strokes = [];
      room.redoStack = [];
      pushSystemMessage(room, 'Returned to lobby — waiting for at least 2 players.');
      syncRoomToAll(room);
      broadcastPublicRooms();
      return;
    }

    // Advance drawer queue
    while (room.drawerQueueIdx < room.drawerOrder.length) {
      const candidateId = room.drawerOrder[room.drawerQueueIdx];
      const candidate = room.players.find((p) => p.id === candidateId && p.connected);
      if (candidate) {
        room.drawerId = candidate.id;
        break;
      }
      room.drawerQueueIdx++;
    }

    if (room.drawerQueueIdx >= room.drawerOrder.length) {
      // Round complete, check if more rounds remain
      if (room.currentRound >= room.settings.rounds) {
        finishGame(room);
        return;
      }
      room.currentRound += 1;
      room.drawerOrder = connectedPlayers.map((p) => p.id);
      room.drawerQueueIdx = 0;
      room.drawerId = room.drawerOrder[0];
    }

    for (const p of room.players) {
      p.isDrawing = p.id === room.drawerId;
      p.hasGuessed = false;
      p.guessOrder = null;
      p.roundScore = 0;
    }

    room.phase = 'CHOOSING_WORD';
    room.secretWord = null;
    room.wordOptions = pickWordOptions(room);
    room.revealedIndices = [];
    room.hintTriggers = [];
    room.strokes = [];
    room.redoStack = [];
    room.roundSummary = null;
    room.guessTimes.clear();
    room.timeLeft = WORD_CHOICE_SECONDS;
    room.totalTime = WORD_CHOICE_SECONDS;

    const drawer = room.players.find((p) => p.id === room.drawerId);
    pushSystemMessage(room, `${drawer?.name ?? 'Player'} is choosing a word...`);
    syncRoomToAll(room);
    broadcastPublicRooms();

    room.timerHandle = setInterval(() => {
      if (room.phase !== 'CHOOSING_WORD') return;
      room.timeLeft -= 1;
      io.to(room.code).emit('timer:tick', {
        timeLeft: room.timeLeft,
        nextHintIn: null,
      });

      if (room.timeLeft <= 0) {
        const autoChoice = room.wordOptions[0]?.word ?? 'cricket bat';
        startDrawingPhase(room, autoChoice);
      }
    }, 1000);
  }

  function startDrawingPhase(room: ServerRoom, chosenWord: string) {
    clearRoomTimer(room);
    room.phase = 'DRAWING';
    room.secretWord = chosenWord;
    room.usedWords.add(chosenWord.toLowerCase());
    room.wordOptions = [];
    room.revealedIndices = [];
    room.timeLeft = room.settings.drawTime;
    room.totalTime = room.settings.drawTime;
    room.hintTriggers = computeHintTriggers(room.settings.drawTime, room.settings.hintCount, chosenWord);

    const drawer = room.players.find((p) => p.id === room.drawerId);
    pushSystemMessage(room, `${drawer?.name ?? 'Artist'} started drawing! Start guessing.`);
    syncRoomToAll(room);

    room.timerHandle = setInterval(() => {
      if (room.phase !== 'DRAWING' || !room.secretWord) return;
      room.timeLeft -= 1;

      // Check if a timed letter hint triggers at this exact second
      if (room.hintTriggers.includes(room.timeLeft)) {
        const revealable = getRevealableIndices(room.secretWord);
        const unrevealed = revealable.filter((idx) => !room.revealedIndices.includes(idx));
        if (unrevealed.length > 1) {
          const picked = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          room.revealedIndices.push(picked);
          const nextHintIn = getNextHintIn(room);
          const guesserPattern = buildHintPattern(room.secretWord, room.revealedIndices);

          for (const p of room.players) {
            if (!p.connected) continue;
            const seesWord = p.id === room.drawerId || p.hasGuessed;
            io.to(p.id).emit('hint:revealed', {
              hintPattern: seesWord ? room.secretWord.toUpperCase() : guesserPattern,
              revealedIndices: room.revealedIndices,
              nextHintIn,
            });
          }

          pushSystemMessage(room, `Letter hint revealed!`, 'hint');
        }
      }

      io.to(room.code).emit('timer:tick', {
        timeLeft: room.timeLeft,
        nextHintIn: getNextHintIn(room),
      });

      if (room.timeLeft <= 0) {
        endRound(room, 'time_up');
      }
    }, 1000);
  }

  function endRound(room: ServerRoom, reason: RoundSummary['reason']) {
    clearRoomTimer(room);
    if (room.phase !== 'DRAWING') return;

    const word = room.secretWord ?? '';
    const drawer = room.players.find((p) => p.id === room.drawerId);

    if (reason === 'all_guessed' && drawer) {
      drawer.roundScore += 40;
      drawer.score += 40;
    }

    const results: RoundPlayerResult[] = room.players
      .filter((p) => p.connected)
      .map((p) => ({
        playerId: p.id,
        playerName: p.name,
        pointsEarned: p.roundScore,
        totalScore: p.score,
        guessedInSeconds: room.guessTimes.get(p.id) ?? null,
      }))
      .sort((a, b) => b.pointsEarned - a.pointsEarned);

    room.phase = 'ROUND_END';
    room.timeLeft = ROUND_END_SECONDS;
    room.totalTime = ROUND_END_SECONDS;
    room.roundSummary = {
      word,
      drawerName: drawer?.name ?? 'Artist',
      reason,
      results,
    };

    const reasonLabel =
      reason === 'all_guessed'
        ? 'Everyone guessed the word!'
        : reason === 'drawer_left'
          ? 'Drawer disconnected.'
          : "Time's up!";
    pushSystemMessage(room, `${reasonLabel} The word was "${word}".`);
    syncRoomToAll(room);

    room.timerHandle = setInterval(() => {
      if (room.phase !== 'ROUND_END') return;
      room.timeLeft -= 1;
      io.to(room.code).emit('timer:tick', {
        timeLeft: room.timeLeft,
        nextHintIn: null,
      });

      if (room.timeLeft <= 0) {
        room.drawerQueueIdx += 1;
        beginWordChoice(room);
      }
    }, 1000);
  }

  function finishGame(room: ServerRoom) {
    clearRoomTimer(room);
    room.phase = 'GAME_OVER';
    room.drawerId = null;
    room.secretWord = null;
    room.timeLeft = 0;
    room.totalTime = 0;
    for (const p of room.players) {
      p.isDrawing = false;
      p.hasGuessed = false;
    }
    pushSystemMessage(room, 'Match finished! Check out the final podium.');
    syncRoomToAll(room);
    broadcastPublicRooms();
  }

  function handlePlayerLeave(socketId: string) {
    const code = socketRoomMap.get(socketId);
    if (!code) return;
    socketRoomMap.delete(socketId);

    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find((p) => p.id === socketId);
    if (!player) return;

    const wasHost = player.isHost;
    const wasDrawer = room.drawerId === socketId;

    room.players = room.players.filter((p) => p.id !== socketId);

    const connectedRemaining = room.players.filter((p) => p.connected);
    if (connectedRemaining.length === 0) {
      clearRoomTimer(room);
      room.cleanupTimeout = setTimeout(() => {
        const current = rooms.get(code);
        if (current && current.players.filter((p) => p.connected).length === 0) {
          clearRoomTimer(current);
          rooms.delete(code);
          broadcastPublicRooms();
        }
      }, 15000);
      broadcastPublicRooms();
      return;
    }

    if (wasHost) {
      connectedRemaining[0].isHost = true;
      pushSystemMessage(room, `${connectedRemaining[0].name} is now the room host.`);
    }

    if (player.voiceJoined) {
      io.to(room.code).emit('voice:peerLeft', { peerId: socketId });
    }

    pushSystemMessage(room, `${player.name} left the room.`);

    if (room.phase === 'DRAWING' && wasDrawer) {
      endRound(room, 'drawer_left');
    } else if (room.phase === 'CHOOSING_WORD' && wasDrawer) {
      room.drawerQueueIdx += 1;
      beginWordChoice(room);
    } else if (room.phase === 'DRAWING') {
      const nonDrawers = connectedRemaining.filter((p) => p.id !== room.drawerId);
      if (nonDrawers.length > 0 && nonDrawers.every((p) => p.hasGuessed)) {
        endRound(room, 'all_guessed');
      } else {
        syncRoomToAll(room);
      }
    } else {
      syncRoomToAll(room);
    }

    broadcastPublicRooms();
  }

  io.on('connection', (socket: Socket) => {
    socket.emit('rooms:updated', getPublicRoomsList());

    socket.on(
      'room:create',
      (
        payload: { name: string; avatar?: AvatarConfig; settings?: Partial<RoomSettings> },
        ack?: (res: { ok: boolean; code?: string; error?: string }) => void
      ) => {
        // Leave any previous room cleanly
        if (socketRoomMap.has(socket.id)) {
          handlePlayerLeave(socket.id);
          socket.leave(socketRoomMap.get(socket.id) ?? '');
        }

        const code = generateRoomCode();
        const settings = sanitizeSettings(payload?.settings);
        const player: Player = {
          id: socket.id,
          name: sanitizeName(payload?.name ?? ''),
          avatar: payload?.avatar ?? defaultAvatar(),
          score: 0,
          roundScore: 0,
          hasGuessed: false,
          guessOrder: null,
          isDrawing: false,
          isHost: true,
          connected: true,
          voiceJoined: false,
          voiceMuted: false,
          isSpeaking: false,
        };

        const room: ServerRoom = {
          code,
          settings,
          phase: 'LOBBY',
          players: [player],
          currentRound: 0,
          drawerOrder: [],
          drawerQueueIdx: 0,
          drawerId: null,
          secretWord: null,
          wordOptions: [],
          usedWords: new Set(),
          timeLeft: 0,
          totalTime: 0,
          revealedIndices: [],
          hintTriggers: [],
          strokes: [],
          redoStack: [],
          messages: [
            {
              id: makeId('msg'),
              text: `Room ${code} created! Share the code or invite link with friends.`,
              kind: 'system',
              timestamp: Date.now(),
            },
          ],
          roundSummary: null,
          guessTimes: new Map(),
          timerHandle: null,
          cleanupTimeout: null,
        };

        rooms.set(code, room);
        socketRoomMap.set(socket.id, code);
        socket.join(code);

        socket.emit('room:state', buildStateForPlayer(room, socket.id));
        broadcastPublicRooms();
        ack?.({ ok: true, code });
      }
    );

    socket.on(
      'room:join',
      (
        payload: { code: string; name: string; avatar?: AvatarConfig },
        ack?: (res: { ok: boolean; code?: string; error?: string }) => void
      ) => {
        const code = String(payload?.code ?? '')
          .trim()
          .toUpperCase();
        const room = rooms.get(code);

        if (!room) {
          ack?.({ ok: false, error: `Room "${code}" not found.` });
          return;
        }

        if (room.cleanupTimeout) {
          clearTimeout(room.cleanupTimeout);
          room.cleanupTimeout = null;
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
          handlePlayerLeave(socket.id);
        }

        const isFirst = room.players.length === 0;
        const player: Player = {
          id: socket.id,
          name: sanitizeName(payload?.name ?? ''),
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
        };

        room.players.push(player);
        socketRoomMap.set(socket.id, code);
        socket.join(code);

        pushSystemMessage(room, `${player.name} joined the room!`);
        syncRoomToAll(room);
        broadcastPublicRooms();
        ack?.({ ok: true, code });
      }
    );

    socket.on('room:leave', () => {
      const code = socketRoomMap.get(socket.id);
      if (code) {
        socket.leave(code);
        handlePlayerLeave(socket.id);
      }
    });

    socket.on('room:updateSettings', (partial: Partial<RoomSettings>) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player?.isHost || room.phase !== 'LOBBY') return;

      room.settings = sanitizeSettings({ ...room.settings, ...partial });
      syncRoomToAll(room);
      broadcastPublicRooms();
    });

    socket.on('game:start', (ack?: (res: { ok: boolean; error?: string }) => void) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
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
      room.usedWords.clear();
      room.drawerOrder = connectedPlayers.map((p) => p.id);
      room.drawerQueueIdx = 0;
      room.strokes = [];
      room.redoStack = [];
      room.roundSummary = null;

      beginWordChoice(room);
      ack?.({ ok: true });
    });

    socket.on('game:playAgain', () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player?.isHost) return;

      clearRoomTimer(room);
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
      room.strokes = [];
      room.redoStack = [];
      room.roundSummary = null;
      pushSystemMessage(room, 'Room reset to lobby for a rematch!');
      syncRoomToAll(room);
      broadcastPublicRooms();
    });

    socket.on('word:select', (word: string) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room || room.phase !== 'CHOOSING_WORD' || room.drawerId !== socket.id) return;

      const validOption = room.wordOptions.find((o) => o.word === word);
      const chosen = validOption ? validOption.word : room.wordOptions[0]?.word;
      if (chosen) {
        startDrawingPhase(room, chosen);
      }
    });

    socket.on('draw:action', (action: DrawAction) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      // Allow drawing by active drawer during DRAWING, or by anyone in LOBBY warmup sketchpad
      const canDraw =
        (room.phase === 'DRAWING' && room.drawerId === socket.id) || room.phase === 'LOBBY';
      if (!canDraw) return;

      if (action.type === 'clear') {
        room.strokes = [];
        room.redoStack = [];
        io.to(room.code).emit('canvas:sync', {
          strokes: room.strokes,
          canUndo: false,
          canRedo: false,
        });
        return;
      }

      // Idempotency guard against duplicate action IDs
      if (room.strokes.some((s) => s.id === action.id)) return;

      room.strokes.push(action);
      room.redoStack = [];
      socket.to(room.code).emit('draw:action', action);
      io.to(room.code).emit('canvas:historyState', {
        canUndo: room.strokes.length > 0,
        canRedo: false,
      });
    });

    socket.on('draw:undo', () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      const canDraw =
        (room.phase === 'DRAWING' && room.drawerId === socket.id) || room.phase === 'LOBBY';
      if (!canDraw || room.strokes.length === 0) return;

      const last = room.strokes.pop();
      if (last) {
        room.redoStack.push(last);
      }
      io.to(room.code).emit('canvas:sync', {
        strokes: room.strokes,
        canUndo: room.strokes.length > 0,
        canRedo: room.redoStack.length > 0,
      });
    });

    socket.on('draw:redo', () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;

      const canDraw =
        (room.phase === 'DRAWING' && room.drawerId === socket.id) || room.phase === 'LOBBY';
      if (!canDraw || room.redoStack.length === 0) return;

      const restored = room.redoStack.pop();
      if (restored) {
        room.strokes.push(restored);
      }
      io.to(room.code).emit('canvas:sync', {
        strokes: room.strokes,
        canUndo: room.strokes.length > 0,
        canRedo: room.redoStack.length > 0,
      });
    });

    socket.on('canvas:reaction', (emoji: string) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
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

    socket.on('chat:guess', (rawText: string) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      const text = String(rawText ?? '').trim().slice(0, 140);
      if (!text) return;

      // Outside of active drawing, normal chat
      if (room.phase !== 'DRAWING' || !room.secretWord) {
        const msg: ChatMessage = {
          id: makeId('msg'),
          playerId: player.id,
          playerName: player.name,
          text,
          kind: 'chat',
          timestamp: Date.now(),
        };
        room.messages.push(msg);
        io.to(room.code).emit('chat:message', msg);
        return;
      }

      // Active drawer cannot leak the answer
      if (player.id === room.drawerId) {
        if (isExactWordMatch(text, room.secretWord) || isCloseGuess(text, room.secretWord)) {
          socket.emit('chat:message', {
            id: makeId('msg'),
            text: "You can't type the secret word while drawing!",
            kind: 'system',
            timestamp: Date.now(),
          });
          return;
        }
        const msg: ChatMessage = {
          id: makeId('msg'),
          playerId: player.id,
          playerName: `${player.name} (Drawer)`,
          text,
          kind: 'chat',
          timestamp: Date.now(),
        };
        room.messages.push(msg);
        io.to(room.code).emit('chat:message', msg);
        return;
      }

      // Player who already guessed chats privately with other guessers & drawer
      if (player.hasGuessed) {
        if (isExactWordMatch(text, room.secretWord)) {
          socket.emit('chat:message', {
            id: makeId('msg'),
            text: 'You already found the word!',
            kind: 'system',
            timestamp: Date.now(),
          });
          return;
        }
        const msg: ChatMessage = {
          id: makeId('msg'),
          playerId: player.id,
          playerName: `${player.name} ✓`,
          text,
          kind: 'chat',
          timestamp: Date.now(),
        };
        for (const p of room.players) {
          if (p.connected && (p.hasGuessed || p.id === room.drawerId)) {
            io.to(p.id).emit('chat:message', msg);
          }
        }
        return;
      }

      // Check exact match (case-insensitive & multi-word spacing normalized)
      if (isExactWordMatch(text, room.secretWord)) {
        const guessedCount = room.players.filter((p) => p.hasGuessed).length;
        const guessOrder = guessedCount + 1;
        player.hasGuessed = true;
        player.guessOrder = guessOrder;

        const speedRatio = room.timeLeft / Math.max(1, room.totalTime);
        const orderBonus = Math.max(0, 60 - (guessOrder - 1) * 15);
        const points = Math.round(120 + speedRatio * 280 + orderBonus);

        player.roundScore += points;
        player.score += points;
        room.guessTimes.set(player.id, Math.max(1, room.totalTime - room.timeLeft));

        const drawer = room.players.find((p) => p.id === room.drawerId);
        if (drawer) {
          drawer.roundScore += 60;
          drawer.score += 60;
        }

        const correctMsg: ChatMessage = {
          id: makeId('msg'),
          playerId: player.id,
          playerName: player.name,
          text: `${player.name} guessed the word! (+${points} pts)`,
          kind: 'correct',
          timestamp: Date.now(),
        };
        room.messages.push(correctMsg);
        io.to(room.code).emit('chat:message', correctMsg);

        // Reveal full word to this guesser immediately
        socket.emit('guess:accepted', {
          word: room.secretWord,
          points,
          hintPattern: room.secretWord.toUpperCase(),
        });

        io.to(room.code).emit('players:updated', room.players);

        const nonDrawers = room.players.filter((p) => p.connected && p.id !== room.drawerId);
        if (nonDrawers.length > 0 && nonDrawers.every((p) => p.hasGuessed)) {
          endRound(room, 'all_guessed');
        }
        return;
      }

      // Check close guess (private nudge only to sender so it never spoils!)
      if (isCloseGuess(text, room.secretWord)) {
        socket.emit('chat:message', {
          id: makeId('msg'),
          text: `"${text}" is very close!`,
          kind: 'close',
          timestamp: Date.now(),
        });
        return;
      }

      // Otherwise broadcast standard guess in chat
      const msg: ChatMessage = {
        id: makeId('msg'),
        playerId: player.id,
        playerName: player.name,
        text,
        kind: 'chat',
        timestamp: Date.now(),
      };
      room.messages.push(msg);
      io.to(room.code).emit('chat:message', msg);
    });

    socket.on('voice:join', () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.voiceJoined = true;
      player.voiceMuted = false;
      player.isSpeaking = false;

      const activePeerIds = room.players
        .filter((p) => p.connected && p.voiceJoined && p.id !== socket.id)
        .map((p) => p.id);

      socket.emit('voice:peers', { peerIds: activePeerIds });
      socket.to(room.code).emit('voice:peerJoined', { peerId: socket.id });
      io.to(room.code).emit('players:updated', room.players);
    });

    socket.on('voice:leave', () => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.voiceJoined = false;
      player.voiceMuted = false;
      player.isSpeaking = false;

      socket.to(room.code).emit('voice:peerLeft', { peerId: socket.id });
      io.to(room.code).emit('players:updated', room.players);
    });

    socket.on('voice:mute', (muted: boolean) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
      if (!room) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player) return;

      player.voiceMuted = Boolean(muted);
      if (player.voiceMuted) {
        player.isSpeaking = false;
      }
      io.to(room.code).emit('players:updated', room.players);
    });

    socket.on('voice:speaking', (speaking: boolean) => {
      const code = socketRoomMap.get(socket.id);
      if (!code) return;
      const room = rooms.get(code);
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
      (payload: {
        to: string;
        description?: Record<string, unknown>;
        candidate?: Record<string, unknown>;
      }) => {
        const code = socketRoomMap.get(socket.id);
        if (!code || !payload?.to) return;
        const room = rooms.get(code);
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

    socket.on('disconnect', () => {
      handlePlayerLeave(socket.id);
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
