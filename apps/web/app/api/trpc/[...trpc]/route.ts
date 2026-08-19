import { NextRequest } from 'next/server';

/**
 * 브라우저 → API 서버 프록시 (#22).
 *
 * 콘솔(클라이언트)이 동일 출처 /api/trpc 로 호출하면 내부 API(${API_URL}/trpc)로 중계한다.
 * - 동일 출처라 session-token 쿠키가 자동 전송되고, API 의 createContext 가 쿠키를 검증한다.
 * - next.config rewrites 는 빌드 시점에 고정되어 Docker 이미지 이식성이 깨지므로
 *   (API_URL 이 이미지에 박힘) 런타임에 env 를 읽는 라우트 핸들러로 구현한다.
 */
const API_URL = () => process.env.API_URL ?? 'http://localhost:3002';

/** hop-by-hop 헤더는 중계하지 않는다 */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'upgrade',
  'host',
]);

async function proxy(request: NextRequest, { params }: { params: Promise<{ trpc: string[] }> }) {
  const { trpc } = await params;

  const url = new URL(`${API_URL()}/trpc/${trpc.map(encodeURIComponent).join('/')}`);
  url.search = request.nextUrl.search;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key)) headers.set(key, value);
  });

  const response = await fetch(url, {
    method: request.method,
    headers,
    body: request.body,
    // Node fetch 에서 스트리밍 body 전송에 필요
    // @ts-expect-error duplex 는 아직 타입에 없다
    duplex: 'half',
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key) && key !== 'content-encoding' && key !== 'content-length') {
      responseHeaders.set(key, value);
    }
  });

  return new Response(response.body, { status: response.status, headers: responseHeaders });
}

export { proxy as GET, proxy as POST };
