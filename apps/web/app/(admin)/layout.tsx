import { redirect } from 'next/navigation';

import AppSidebarAdmin from '@/components/app-sidebar-admin';
import { SidebarProvider } from '@/components/ui/sidebar';
import { trpc } from '@/src/utils/trpc';
import { TRPCReactProvider } from '@/src/utils/trpc-react';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 미들웨어가 admin 세션을 보장하지만, 계정 정보는 여기(RSC)서 한 번 조회해 내려준다 (#10)
  const me = await trpc.admin.me.query().catch(() => null);
  if (!me) {
    redirect('/login?error=' + encodeURIComponent('로그인 후 이용해주세요.'));
  }

  return (
    <TRPCReactProvider>
      <SidebarProvider>
        <AppSidebarAdmin email={me.email}>{children}</AppSidebarAdmin>
      </SidebarProvider>
    </TRPCReactProvider>
  );
}
