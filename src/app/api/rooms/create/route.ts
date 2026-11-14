import { NextRequest, NextResponse } from 'next/server';
import type { AvatarConfig, RoomSettings } from '@/src/shared/types.ts';
import {
  buildStateForPlayer,
  createRoomObject,
  makeId,
  saveRoom,
} from '@/src/server/gameEngine.ts';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      playerId?: string;
      name?: string;
      avatar?: AvatarConfig;
      settings?: Partial<RoomSettings>;
    };

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
      state: buildStateForPlayer(room, playerId),
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Failed to create room.' },
      { status: 500 }
    );
  }
}
