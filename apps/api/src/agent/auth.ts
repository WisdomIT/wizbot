import type { Request } from 'express';
import { jwtVerify } from 'jose';

/**
 * 에이전트 SSE 인증 (#35) — 세션 쿠키/헤더만 받는다 (song-events 와 같은 규칙,
 * 송출 소스 토큰은 제외). 어드민 대행(#71)도 대행 대상 스트리머로 동작한다.
 */
export async function resolveStreamerId(req: Request): Promise<number | null> {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  const authorization = req.headers.authorization;
  const cookieHeader = req.headers.cookie ?? '';
  const fromCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('session-token='))
    ?.slice('session-token='.length);
  const sessionToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : fromCookie;
  if (!sessionToken) return null;

  try {
    const { payload } = await jwtVerify(sessionToken, new TextEncoder().encode(jwtSecret));
    if (typeof payload.id !== 'number') return null;
    if (payload.role === 'streamer') return payload.id;
    if (payload.role === 'admin') {
      const acting = cookieHeader
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('admin-acting-as='))
        ?.slice('admin-acting-as='.length);
      const userId = Number(acting);
      return Number.isInteger(userId) && userId > 0 ? userId : null;
    }
    return null;
  } catch {
    return null;
  }
}
