import { ACTING_COOKIE, actingCookieOptions } from '@/lib/acting-as';
import { redirectTo } from '@/lib/request-url';

/** 어드민 대행 종료 (#71) — 쿠키를 지우고 목록으로 */
export function GET() {
  const headers = new Headers();
  headers.append('Set-Cookie', `${ACTING_COOKIE}=; ${actingCookieOptions(0)}`);
  return redirectTo('/admin/streamers', headers);
}
