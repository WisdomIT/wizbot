import type { NextRequest } from 'next/server';

import { ACTING_COOKIE, actingCookieOptions } from '@/lib/acting-as';
import { redirectTo } from '@/lib/request-url';
import { trpc } from '@/src/utils/trpc';

/** 어드민 대행 종료 (#71) — 쿠키를 지우고 목록으로. 어느 스트리머였는지는 쿠키가 안다 (#254 접근 기록) */
export async function GET(request: NextRequest) {
  const acting = request.cookies.get(ACTING_COOKIE)?.value;
  if (acting && /^\d+$/.test(acting)) {
    await trpc.audit.recordActing.mutate({ userId: Number(acting), phase: 'end' }).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[audit] 대행 종료 기록 실패:', error);
    });
  }
  const headers = new Headers();
  headers.append('Set-Cookie', `${ACTING_COOKIE}=; ${actingCookieOptions(0)}`);
  return redirectTo('/admin/streamers', headers);
}
