import { redirect } from 'next/navigation';

import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
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
    // 앱은 켜자마자 여기로 온다 — 첫 로그인이 오류처럼 보이지 않도록 안내 문구를 붙이지 않는다
    redirect('/login');
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
