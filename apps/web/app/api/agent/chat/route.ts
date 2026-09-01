import { NextRequest } from 'next/server';

/**
 * 에이전트 채팅 SSE 프록시 (#35) — 브라우저 → 내부 API. song/events 와 같은 방식.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_URL = () => process.env.API_URL ?? 'http://localhost:3002';

export async function POST(request: NextRequest) {
  const headers = new Headers({ accept: 'text/event-stream', 'content-type': 'application/json' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const upstream = await fetch(new URL('/agent/chat', API_URL()), {
    method: 'POST',
    headers,
    body: await request.text(),
    signal: request.signal,
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text().catch(() => null), {
      status: upstream.status,
      headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
