import { redirect } from 'next/navigation';

import AppSidebarStreamer from '@/components/app-sidebar-streamer';
import { SidebarProvider } from '@/components/ui/sidebar';
import { trpc } from '@/src/utils/trpc';
import { TRPCReactProvider } from '@/src/utils/trpc-react';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 미들웨어가 streamer 세션을 보장하지만, 사용자 정보는 여기(RSC)서 한 번 조회해 내려준다
  // (기존: 사이드바가 useEffect 로 서버 액션 호출 → 렌더 후 워터폴 + 빈 상태 깜빡임)
  const me = await trpc.user.me.query().catch(() => null);
  if (!me) {
    redirect('/login?error=' + encodeURIComponent('로그인 후 이용해주세요.'));
  }

  const user = {
    nickname: me.channelName,
    id: me.channelId,
    avatar: me.channelImageUrl ?? '',
  };

  return (
    <TRPCReactProvider>
      <SidebarProvider>
        <AppSidebarStreamer user={user}>{children}</AppSidebarStreamer>
      </SidebarProvider>
    </TRPCReactProvider>
  );
}
