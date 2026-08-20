/**
 * 라우트 핸들러용 URL 유틸 (#24).
 *
 * 라우트 핸들러의 request.url 은 서버 바인드 주소(예: http://0.0.0.0:3001)를 반영해
 * 프록시(Traefik) 뒤에서 절대 URL 을 만들면 깨진다.
 * - 내부 이동은 상대 Location 리다이렉트(redirectTo)를 쓰고,
 * - 외부에 전달할 절대 URL(OAuth redirectUri)만 forwarded 헤더에서 origin 을 유도한다.
 */

/** 상대 경로 307 리다이렉트 (RFC 9110 — Location 은 상대 참조 허용) */
export function redirectTo(path: string, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Location', path);
  return new Response(null, { status: 307, headers: responseHeaders });
}

/** 요청의 외부 기준 origin (Traefik 의 x-forwarded-* 우선, 없으면 Host 헤더) */
export function getRequestOrigin(headers: Headers): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost';
  const proto = headers.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}
