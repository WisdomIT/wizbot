import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/src/router';

const API_URL = process.env.API_URL ?? 'http://localhost:3002';

/**
 * 서버 전용 tRPC 클라이언트 (서버 컴포넌트 / 서버 액션 / 라우트 핸들러).
 * 현재 요청의 session-token 쿠키를 Authorization 헤더로 API에 전달해
 * streamerProcedure가 사용자를 식별할 수 있게 한다.
 * 요청 스코프 밖(미들웨어 등)에서는 인증 없이 호출된다.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/trpc`,
      headers: async () => {
        try {
          const { cookies } = await import('next/headers');
          const token = (await cookies()).get('session-token')?.value;
          return token ? { Authorization: `Bearer ${token}` } : {};
        } catch {
          return {};
        }
      },
    }),
  ],
});

export type TrpcClient = typeof trpc;
