import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getMe } from '@/app/_lib/me';
import AppSidebarStreamer from '@/components/app-sidebar-streamer';
import { NoticePopup } from '@/components/notice/notice-popup';
import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { SidebarProvider } from '@/components/ui/sidebar';
import { SESSION_EXPIRED_REDIRECT } from '@/lib/session-expired';
import { TRPCReactProvider } from '@/src/utils/trpc-react';

// 인증 콘솔은 요청마다 세션으로 렌더돼야 한다. 명시하지 않으면 빌드 시(API 부재)
// 레이아웃의 me 조회 실패 → redirect 가 정적 프리렌더로 구워져, 로그인해도 /login 으로
// 튕기는 페이지가 생길 수 있다 (PR #70 에서 /admin/streamers 로 실측).
export const dynamic = 'force-dynamic';

/** 콘솔 탭의 파비콘도 스트리머 본인 프로필로 (#77) */
export async function generateMetadata(): Promise<Metadata> {
  const me = await getMe();
  return me?.channelImageUrl ? { icons: { icon: me.channelImageUrl } } : {};
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 미들웨어가 streamer 세션을 보장하지만, 사용자 정보는 여기(RSC)서 한 번 조회해 내려준다
  // (기존: 사이드바가 useEffect 로 서버 액션 호출 → 렌더 후 워터폴 + 빈 상태 깜빡임)
  const me = await getMe();
  if (!me) {
    //  쿠키는 있는데 사용자가 없으면(환경 분리·탈퇴 뒤 남은 세션) 쿠키를 지우고 보낸다 — 아니면 로그인 페이지와 무한 루프 (#185)
    const hasCookie = !!(await cookies()).get('session-token');
    redirect(hasCookie ? SESSION_EXPIRED_REDIRECT : '/login?error=' + encodeURIComponent('로그인 후 이용해주세요.'));
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
          {/* 확인 안 한 팝업 공지 — 확인하면 다시 안 뜬다 (#206) */}
          <NoticePopup />
        </SidebarProvider>
      </StreamerThemeScope>
    </TRPCReactProvider>
  );
}
