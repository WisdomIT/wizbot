import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/src/router';
import { net, session } from 'electron';

import { SITE_URL } from './config';

/**
 * 메인 프로세스에서 쓰는 tRPC 클라이언트.
 *
 * 창과 같은 세션의 쿠키를 실어야 하므로 Node 의 fetch 대신 Electron 의 net.fetch 를 쓴다
 * (앱은 웹과 같은 세션 쿠키로 인증한다 — 앱 전용 토큰을 따로 두지 않는다).
 */
export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${SITE_URL}/api/trpc`,
      fetch: (input, init) =>
        net.fetch(input as string, {
          ...(init as RequestInit),
          credentials: 'include',
          session: session.defaultSession,
        } as RequestInit),
    }),
  ],
});

export type PlayerState = Awaited<ReturnType<typeof api.song.getState.query>>;

/** 로그인 전에는 실패한다 — 호출부에서 조용히 넘긴다 */
export async function fetchState(): Promise<PlayerState | null> {
  return api.song.getState.query().catch(() => null);
}
