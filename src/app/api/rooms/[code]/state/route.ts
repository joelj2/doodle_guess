import { NextRequest, NextResponse } from 'next/server';
import {
  advanceRoomClock,
  buildStateForPlayer,
  getRoom,
  saveRoom,
} from '@/src/server/gameEngine.ts';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params;
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

  // Drain private messages & voice signals targeted to this player
  const privateMessages = room.privateMessages[playerId] ?? [];
  if (privateMessages.length > 0) {
    room.privateMessages[playerId] = [];
  }

  const voiceSignals = room.voiceSignals[playerId] ?? [];
  if (voiceSignals.length > 0) {
    room.voiceSignals[playerId] = [];
  }

  // Prune old reactions > 6 seconds
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
