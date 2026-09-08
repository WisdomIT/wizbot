import { ACTING_COOKIE, actingCookieOptions } from '@/lib/acting-as';
import { redirectTo } from '@/lib/request-url';
import { trpc } from '@/src/utils/trpc';

/**
 * 어드민 대행 시작 (#71) — 대상 스트리머를 쿠키로 심고 콘솔 첫 페이지로.
 * 미들웨어가 /admin 은 admin 세션만 통과시키므로 여기까지 온 요청은 어드민이다.
 * 접근 기록(#254)으로 대행 시작을 남긴다 — 기록 실패가 대행 자체를 막진 않는다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!/^\d+$/.test(userId)) return redirectTo('/admin/streamers');
  await trpc.audit.recordActing.mutate({ userId: Number(userId), phase: 'start' }).catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[audit] 대행 시작 기록 실패:', error);
  });
  const headers = new Headers();
  headers.append('Set-Cookie', `${ACTING_COOKIE}=${userId}; ${actingCookieOptions()}`);
  return redirectTo(`/admin/streamers/${userId}/bot/command`, headers);
}
