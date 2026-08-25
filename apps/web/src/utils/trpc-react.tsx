'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@wizbot/shared/router';
import { useState } from 'react';

/**
 * 콘솔(클라이언트)용 tRPC — 동일 출처 /api/trpc 프록시를 통해 API 를 호출한다 (#22).
 * 컴포넌트에서는 `const trpc = useTRPC()` 후 `useQuery(trpc.x.y.queryOptions())` 형태로 사용.
 * 서버(RSC/서버 액션)에서는 기존 src/utils/trpc.ts 를 사용한다.
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 콘솔 데이터는 본인만 수정하므로 짧은 staleTime 으로 재요청을 줄인다
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      }),
  );
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: '/api/trpc' })],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
