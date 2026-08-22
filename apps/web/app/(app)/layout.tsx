import { redirect } from 'next/navigation';

import { trpc } from '@/src/utils/trpc';
import { TRPCReactProvider } from '@/src/utils/trpc-react';

/**
 * 데스크톱 앱(#85)이 띄우는 화면 — 사이드바·브레드크럼 없이 내용만 그린다.
 * 앱은 이 사이트를 그대로 로드하므로 UI 가 콘솔과 항상 일치한다.
 */
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await trpc.user.me.query().catch(() => null);
  if (!me) {
    redirect('/login?error=' + encodeURIComponent('로그인 후 이용해주세요.'));
  }

  return (
    <TRPCReactProvider>
      <main className="min-h-svh px-4">{children}</main>
    </TRPCReactProvider>
  );
}
