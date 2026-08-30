import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import AppSidebarAdmin from '@/components/app-sidebar-admin';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SESSION_EXPIRED_REDIRECT } from '@/lib/session-expired';
import { trpc } from '@/src/utils/trpc';
import { TRPCReactProvider } from '@/src/utils/trpc-react';

// 인증 콘솔은 요청마다 세션으로 렌더돼야 한다. 명시하지 않으면 빌드 시(API 부재)
// 레이아웃의 me 조회 실패 → redirect 가 정적 프리렌더로 구워져, 로그인해도 /login 으로
// 튕기는 페이지가 생길 수 있다 (PR #70 에서 /admin/streamers 로 실측).
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 미들웨어가 admin 세션을 보장하지만, 계정 정보는 여기(RSC)서 한 번 조회해 내려준다 (#10)
  const me = await trpc.admin.me.query().catch(() => null);
  if (!me) {
    //  쿠키는 있는데 관리자가 없으면 쿠키를 지우고 보낸다 — 아니면 로그인 페이지와 무한 루프 (#185)
    const hasCookie = !!(await cookies()).get('session-token');
    redirect(hasCookie ? SESSION_EXPIRED_REDIRECT : '/login?error=' + encodeURIComponent('로그인 후 이용해주세요.'));
  }

  return (
    <TRPCReactProvider>
      <SidebarProvider>
        <AppSidebarAdmin email={me.email}>{children}</AppSidebarAdmin>
      </SidebarProvider>
    </TRPCReactProvider>
  );
}
