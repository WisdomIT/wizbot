/**
 * 어드민 대행 쿠키 (#71). admin 세션과 함께 있을 때만 API 가 인정한다 — 스트리머 세션엔 무의미하다.
 * HttpOnly·SameSite=Strict, 브라우저 세션 동안만 (maxAge 없음). 나갈 때 exit 라우트가 지운다.
 */
export const ACTING_COOKIE = 'admin-acting-as';

export function actingCookieOptions(maxAge?: number): string {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Strict'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

/** 대행 콘솔의 경로 접두어 — 스트리머 콘솔 `/streamer/**` 를 1:1 로 미러링한다 */
export function actingBasePath(userId: number | string): string {
  return `/admin/streamers/${userId}`;
}
