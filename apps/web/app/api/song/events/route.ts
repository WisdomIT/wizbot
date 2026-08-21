import { NextRequest } from 'next/server';

/**
 * 재생 이벤트 SSE 프록시 (#5 2단계).
 * 브라우저(컨트롤러·OBS 페이지) → 내부 API 로 스트림을 그대로 중계한다.
 * 응답 본문을 버퍼링 없이 흘려보내야 하므로 Node 런타임에서 동적으로 처리한다.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_URL = () => process.env.API_URL ?? 'http://localhost:3002';

export async function GET(request: NextRequest) {
  const url = new URL('/song/events', API_URL());
  const token = request.nextUrl.searchParams.get('token');
  if (token) url.searchParams.set('token', token);

  const headers = new Headers({ accept: 'text/event-stream' });
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);

  const upstream = await fetch(url, {
    headers,
    signal: request.signal,
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(null, { status: upstream.status });
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
