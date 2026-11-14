import { NextRequest, NextResponse } from 'next/server';
import type { AvatarConfig, DrawAction, PublicRoomSummary, RoomSettings, RoomStateSync } from '@/src/shared/types.ts';
import {
  advanceRoomClock,
  beginWordChoiceOnRoom,
  buildStateForPlayer,
  createRoomObject,
  defaultAvatar,
  deleteRoom,
  getPublicRoomsList,
  getRoom,
  makeId,
  processGuessOrChat,
  pushSystemMessage,
  removePlayerFromRoom,
  sanitizeName,
  sanitizeSettings,
  saveRoom,
  startDrawingPhaseOnRoom,
} from '@/src/server/gameEngine.ts';
import type { ServerRoom } from '@/src/server/gameEngine.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase();

  // If no room code, list public rooms
  if (!code) {
    const rooms = await getPublicRoomsList();
    return NextResponse.json({ rooms });
  }

  const playerId = req.nextUrl.searchParams.get('playerId') ?? '';
  const sinceReaction = Number(req.nextUrl.searchParams.get('sinceReaction') ?? '0') || 0;

  const room = await getRoom(code);
  if (!room) {
    return NextResponse.json({ ok: false, error: 'Room not found.' }, { status: 404 });
  }

  const now = Date.now();
  const player = room.players.find((p) => p.id === playerId);
  if (player) {
    player.lastSeen = now;
  }

  const { changed } = advanceRoomClock(room, now);

  const privateMessages = room.privateMessages[playerId] ?? [];
  if (privateMessages.length > 0) {
    room.privateMessages[playerId] = [];
  }

  const voiceSignals = room.voiceSignals[playerId] ?? [];
  if (voiceSignals.length > 0) {
    room.voiceSignals[playerId] = [];
  }

  room.recentReactions = room.recentReactions.filter((r) => now - r.createdAt <= 6000);
  const reactions = room.recentReactions.filter((r) => r.createdAt > sinceReaction);

  if (changed || privateMessages.length > 0 || voiceSignals.length > 0 || player) {
    await saveRoom(room);
  }

  return NextResponse.json({
    ok: true,
    state: buildStateForPlayer(room, playerId, now),
    privateMessages,
    voiceSignals,
    reactions,
    serverNow: now,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      op?: 'create' | 'join' | 'action' | 'rehydrate' | 'announce';
      code?: string;
      playerId?: string;
      name?: string;
      avatar?: AvatarConfig;
      settings?: Partial<RoomSettings>;
      type?: string;
      payload?: unknown;
      snapshot?: RoomStateSync;
      room?: PublicRoomSummary;
    };

    const op = body.op ?? 'action';
    const now = Date.now();

    if (op === 'announce' && body.room) {
      const summary = body.room;
      if (summary?.code) {
        let r = await getRoom(summary.code);
        if (!r) {
          r = createRoomObject(makeId('h'), summary.hostName, undefined, {
            isPublic: true,
            maxPlayers: summary.maxPlayers,
            rounds: summary.totalRounds,
          });
          r.code = summary.code;
        }
        r.phase = summary.phase;
        r.currentRound = summary.currentRound;
        r.updatedAt = now;
        await saveRoom(r);
      }
      return NextResponse.json({ ok: true });
    }

    if (op === 'create') {
      const playerId = body.playerId?.trim() || makeId('p');
      const room = createRoomObject(
        playerId,
        body.name ?? '',
        body.avatar,
        body.settings,
        true
      );
      await saveRoom(room);
      return NextResponse.json({
        ok: true,
        code: room.code,
        playerId,
        state: buildStateForPlayer(room, playerId, now),
      });
    }

    if (op === 'join') {
      const code = String(body.code ?? '')
        .trim()
        .toUpperCase();
      if (!code) {
        return NextResponse.json(
          { ok: false, error: 'Please enter a room code.' },
          { status: 400 }
        );
      }

      const room = await getRoom(code);
      if (!room) {
        return NextResponse.json(
          { ok: false, error: `Room "${code}" not found.` },
          { status: 404 }
        );
      }

      advanceRoomClock(room, now);

      const playerId = body.playerId?.trim() || makeId('p');
      const existing = room.players.find((p) => p.id === playerId);
      if (existing) {
        existing.lastSeen = now;
        existing.connected = true;
        await saveRoom(room);
        return NextResponse.json({
          ok: true,
          code: room.code,
          playerId,
          state: buildStateForPlayer(room, playerId, now),
        });
      }

      if (room.players.length >= room.settings.maxPlayers) {
        return NextResponse.json(
          { ok: false, error: 'This room is already full.' },
          { status: 409 }
        );
      }

      const isFirst = room.players.length === 0;
      const playerName = sanitizeName(body.name ?? '');

      room.players.push({
        id: playerId,
        name: playerName,
        avatar: body.avatar ?? defaultAvatar(),
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
        isHttp: true,
      });

      pushSystemMessage(room, `${playerName} joined the room!`);
      await saveRoom(room);

      return NextResponse.json({
        ok: true,
        code: room.code,
        playerId,
        state: buildStateForPlayer(room, playerId, now),
      });
    }

    if (op === 'rehydrate' && body.snapshot) {
      const snap = body.snapshot;
      const existing = await getRoom(snap.code);
      if (existing) {
        return NextResponse.json({
          ok: true,
          state: buildStateForPlayer(existing, body.playerId ?? '', now),
        });
      }
      const restored: ServerRoom = {
        code: snap.code,
        settings: sanitizeSettings(snap.settings),
        phase: snap.phase === 'LOBBY' ? 'LOBBY' : 'LOBBY',
        players: snap.players.map((p) => ({
          ...p,
          isDrawing: false,
          hasGuessed: false,
          guessOrder: null,
          lastSeen: now,
          isHttp: true,
        })),
        currentRound: 0,
        drawerOrder: [],
        drawerQueueIdx: 0,
        drawerId: null,
        secretWord: null,
        wordOptions: [],
        usedWords: [],
        phaseEndsAt: 0,
        totalTime: 0,
        revealedIndices: [],
        hintTriggers: [],
        triggeredHints: [],
        strokes: snap.strokes ?? [],
        redoStack: [],
        messages: snap.messages ?? [],
        privateMessages: {},
        voiceSignals: {},
        recentReactions: [],
        roundSummary: null,
        guessTimes: {},
        updatedAt: now,
      };
      await saveRoom(restored);
      return NextResponse.json({
        ok: true,
        state: buildStateForPlayer(restored, body.playerId ?? '', now),
      });
    }

    // op === 'action'
    const code = String(body.code ?? '')
      .trim()
      .toUpperCase();
    const room = await getRoom(code);
    if (!room) {
      return NextResponse.json({ ok: false, error: 'Room not found.' }, { status: 404 });
    }

    const playerId = body.playerId ?? '';
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      return NextResponse.json({ ok: false, error: 'Player not in room.' }, { status: 403 });
    }

    player.lastSeen = now;
    advanceRoomClock(room, now);

    switch (body.type) {
      case 'leave': {
        const res = removePlayerFromRoom(room, playerId);
        if (res.empty) {
          await deleteRoom(room.code);
        } else {
          await saveRoom(room);
        }
        return NextResponse.json({ ok: true });
      }

      case 'updateSettings': {
        if (!player.isHost || room.phase !== 'LOBBY') {
          return NextResponse.json({ ok: false, error: 'Only host can update settings in lobby.' });
        }
        room.settings = sanitizeSettings({
          ...room.settings,
          ...(body.payload as Partial<RoomSettings>),
        });
        await saveRoom(room);
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'start': {
        if (!player.isHost) {
          return NextResponse.json({ ok: false, error: 'Only the room host can start the match.' });
        }
        const connectedPlayers = room.players.filter((p) => p.connected);
        if (connectedPlayers.length < 2) {
          return NextResponse.json({
            ok: false,
            error: 'Need at least 2 players to start a competitive match.',
          });
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
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'playAgain': {
        if (!player.isHost) {
          return NextResponse.json({ ok: false, error: 'Only host can reset match.' });
        }
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
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'selectWord': {
        if (room.phase !== 'CHOOSING_WORD' || room.drawerId !== playerId) {
          return NextResponse.json({ ok: false, error: 'Not your turn to select a word.' });
        }
        const chosenWord = String(body.payload ?? '');
        const valid = room.wordOptions.find((o) => o.word === chosenWord);
        const target = valid ? valid.word : room.wordOptions[0]?.word;
        if (target) {
          startDrawingPhaseOnRoom(room, target);
        }
        await saveRoom(room);
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'draw': {
        const canDraw =
          (room.phase === 'DRAWING' && room.drawerId === playerId) || room.phase === 'LOBBY';
        if (!canDraw) {
          return NextResponse.json({ ok: false, error: 'Cannot draw right now.' });
        }
        const action = body.payload as DrawAction;
        if (action.type === 'clear') {
          room.strokes = [];
          room.redoStack = [];
        } else if (!room.strokes.some((s) => s.id === action.id)) {
          room.strokes.push(action);
          room.redoStack = [];
        }
        await saveRoom(room);
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'undo': {
        const canDraw =
          (room.phase === 'DRAWING' && room.drawerId === playerId) || room.phase === 'LOBBY';
        if (canDraw && room.strokes.length > 0) {
          const last = room.strokes.pop();
          if (last) room.redoStack.push(last);
          await saveRoom(room);
        }
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'redo': {
        const canDraw =
          (room.phase === 'DRAWING' && room.drawerId === playerId) || room.phase === 'LOBBY';
        if (canDraw && room.redoStack.length > 0) {
          const restored = room.redoStack.pop();
          if (restored) room.strokes.push(restored);
          await saveRoom(room);
        }
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'reaction': {
        const emoji = String(body.payload ?? '');
        const allowed = ['👍', '🔥', '😂', '😮', '👏', '🎨'];
        if (allowed.includes(emoji)) {
          room.recentReactions.push({
            id: makeId('react'),
            emoji,
            playerName: player.name,
            xRatio: 0.12 + Math.random() * 0.76,
            createdAt: now,
          });
          if (room.recentReactions.length > 30) {
            room.recentReactions = room.recentReactions.slice(-20);
          }
          await saveRoom(room);
        }
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'guess': {
        const result = processGuessOrChat(room, playerId, String(body.payload ?? ''));
        if (result.type === 'private_to_sender' && result.message) {
          room.privateMessages[playerId] = [
            ...(room.privateMessages[playerId] ?? []),
            result.message,
          ];
        } else if (result.type === 'private_to_guessers' && result.message) {
          for (const p of room.players) {
            if (p.connected && (p.hasGuessed || p.id === room.drawerId)) {
              room.privateMessages[p.id] = [
                ...(room.privateMessages[p.id] ?? []),
                result.message,
              ];
            }
          }
        }
        await saveRoom(room);
        return NextResponse.json({
          ok: true,
          state: buildStateForPlayer(room, playerId, now),
          acceptedGuess:
            result.type === 'correct'
              ? { word: result.acceptedWord, points: result.points }
              : null,
        });
      }

      case 'voiceJoin': {
        player.voiceJoined = true;
        player.voiceMuted = false;
        player.isSpeaking = false;
        const peerIds = room.players
          .filter((p) => p.connected && p.voiceJoined && p.id !== playerId)
          .map((p) => p.id);
        await saveRoom(room);
        return NextResponse.json({
          ok: true,
          peerIds,
          state: buildStateForPlayer(room, playerId, now),
        });
      }

      case 'voiceLeave': {
        player.voiceJoined = false;
        player.voiceMuted = false;
        player.isSpeaking = false;
        await saveRoom(room);
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'voiceMute': {
        player.voiceMuted = Boolean(body.payload);
        if (player.voiceMuted) player.isSpeaking = false;
        await saveRoom(room);
        return NextResponse.json({ ok: true, state: buildStateForPlayer(room, playerId, now) });
      }

      case 'voiceSpeaking': {
        player.isSpeaking = player.voiceMuted ? false : Boolean(body.payload);
        await saveRoom(room);
        return NextResponse.json({ ok: true });
      }

      case 'voiceSignal': {
        const sig = body.payload as {
          to: string;
          description?: Record<string, unknown>;
          candidate?: Record<string, unknown>;
        };
        if (sig?.to && room.players.some((p) => p.id === sig.to && p.connected)) {
          room.voiceSignals[sig.to] = [
            ...(room.voiceSignals[sig.to] ?? []),
            {
              from: playerId,
              description: sig.description,
              candidate: sig.candidate,
            },
          ];
          await saveRoom(room);
        }
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Request failed.' }, { status: 500 });
  }
}
