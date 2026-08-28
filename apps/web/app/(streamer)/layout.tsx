import { redirect } from 'next/navigation';

import AppSidebarStreamer from '@/components/app-sidebar-streamer';
import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { SidebarProvider } from '@/components/ui/sidebar';
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
      {/* 콘솔도 스트리머 본인 테마를 따른다 — 시청자가 보는 것과 같은 모습으로 (#77) */}
      <StreamerThemeScope theme={me.theme} className="min-h-svh">
        <SidebarProvider>
          <AppSidebarStreamer user={user}>{children}</AppSidebarStreamer>
        </SidebarProvider>
      </StreamerThemeScope>
    </TRPCReactProvider>
  );
}
