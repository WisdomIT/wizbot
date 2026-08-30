import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getMe } from '@/app/_lib/me';
import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { SESSION_EXPIRED_REDIRECT } from '@/lib/session-expired';
import { TRPCReactProvider } from '@/src/utils/trpc-react';

/**
 * 데스크톱 앱(#85)이 띄우는 화면 — 사이드바·브레드크럼 없이 내용만 그린다.
 * 앱은 이 사이트를 그대로 로드하므로 UI 가 콘솔과 항상 일치한다.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const me = await getMe();
  return me?.channelImageUrl ? { icons: { icon: me.channelImageUrl } } : {};
}

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMe();
  if (!me) {
    //  쿠키는 있는데 사용자가 없으면(환경 분리·탈퇴 뒤 남은 세션) 쿠키를 지우고 안내와 함께 로그인으로 —
    //  아니면 로그인 페이지 ↔ /app/player 무한 루프로 앱이 검정 화면만 보인다 (#185).
    //  쿠키가 없는 첫 실행은 오류처럼 보이지 않도록 안내 문구 없이
    const hasCookie = !!(await cookies()).get('session-token');
    redirect(hasCookie ? SESSION_EXPIRED_REDIRECT : '/login');
  }

  return (
    <TRPCReactProvider>
      {/*
        앱은 창처럼 동작한다 — 바깥 스크롤 없이 화면 높이에 맞춘다.
        좌우 여백을 주지 않는다: 타이틀바가 창 끝까지 닿아야 하는데,
        여기서 패딩을 주면 음수 마진으로 되밀어야 하고 그게 overflow-hidden 에 잘린다.
      */}
      <StreamerThemeScope theme={me.theme}>
        <main className="h-svh overflow-hidden">{children}</main>
      </StreamerThemeScope>
    </TRPCReactProvider>
  );
}
