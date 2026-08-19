import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/src/router';

/** 내부 서비스 토큰으로 인증하는 API 클라이언트 (internalProcedure 호출용). env는 요청 시점에 읽는다 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${process.env.API_URL ?? 'http://localhost:3002'}/trpc`,
      headers: () => ({ 'x-internal-token': process.env.INTERNAL_API_TOKEN ?? '' }),
    }),
  ],
});
