import { NextResponse } from 'next/server';
import { hasSharedRedisStore, isSocketServerActive } from '@/src/server/gameEngine.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    transport: isSocketServerActive() ? 'socketio' : 'http',
    sharedStore: hasSharedRedisStore(),
  });
}
