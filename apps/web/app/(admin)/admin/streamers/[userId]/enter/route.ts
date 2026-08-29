import { ACTING_COOKIE, actingCookieOptions } from '@/lib/acting-as';
import { redirectTo } from '@/lib/request-url';

/**
 * 어드민 대행 시작 (#71) — 대상 스트리머를 쿠키로 심고 콘솔 첫 페이지로.
 * 미들웨어가 /admin 은 admin 세션만 통과시키므로 여기까지 온 요청은 어드민이다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^\d+$/.test(userId)) return redirectTo('/admin/streamers');
  const headers = new Headers();
  headers.append('Set-Cookie', `${ACTING_COOKIE}=${userId}; ${actingCookieOptions()}`);
  return redirectTo(`/admin/streamers/${userId}/bot/command`, headers);
}
