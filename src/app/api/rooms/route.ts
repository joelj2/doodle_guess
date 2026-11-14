import { NextResponse } from 'next/server';
import { getPublicRoomsList } from '@/src/server/gameEngine.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rooms = await getPublicRoomsList();
  return NextResponse.json({ rooms });
}
