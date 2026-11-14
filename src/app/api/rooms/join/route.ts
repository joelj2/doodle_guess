import { NextRequest, NextResponse } from 'next/server';
import type { AvatarConfig } from '@/src/shared/types.ts';
import {
  advanceRoomClock,
  buildStateForPlayer,
  defaultAvatar,
  getRoom,
  makeId,
  pushSystemMessage,
  sanitizeName,
  saveRoom,
} from '@/src/server/gameEngine.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      code?: string;
      playerId?: string;
      name?: string;
      avatar?: AvatarConfig;
    };

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

    advanceRoomClock(room);

    const playerId = body.playerId?.trim() || makeId('p');
    const existing = room.players.find((p) => p.id === playerId);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.connected = true;
      await saveRoom(room);
      return NextResponse.json({
        ok: true,
        code: room.code,
        playerId,
        state: buildStateForPlayer(room, playerId),
      });
    }

    if (room.players.length >= room.settings.maxPlayers) {
      return NextResponse.json(
        { ok: false, error: 'This room is already full.' },
        { status: 409 }
      );
    }

    const now = Date.now();
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
      state: buildStateForPlayer(room, playerId),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to join room.' },
      { status: 500 }
    );
  }
}
