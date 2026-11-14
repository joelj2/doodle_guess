import { NextRequest, NextResponse } from 'next/server';
import type { DrawAction, RoomSettings } from '@/src/shared/types.ts';
import {
  advanceRoomClock,
  beginWordChoiceOnRoom,
  buildStateForPlayer,
  deleteRoom,
  getRoom,
  makeId,
  processGuessOrChat,
  pushSystemMessage,
  removePlayerFromRoom,
  sanitizeSettings,
  saveRoom,
  startDrawingPhaseOnRoom,
} from '@/src/server/gameEngine.ts';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await context.params;
    const body = (await req.json()) as {
      playerId: string;
      type: string;
      payload?: unknown;
    };

    const room = await getRoom(code);
    if (!room) {
      return NextResponse.json({ ok: false, error: 'Room not found.' }, { status: 404 });
    }

    const now = Date.now();
    const playerId = body.playerId;
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
    return NextResponse.json({ ok: false, error: 'Action failed.' }, { status: 500 });
  }
}
