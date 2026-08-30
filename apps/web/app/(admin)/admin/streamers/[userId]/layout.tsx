import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getMe } from '@/app/_lib/me';
import { ActingBanner } from '@/components/acting-banner';
import AppSidebarStreamer from '@/components/app-sidebar-streamer';
import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ACTING_COOKIE, actingBasePath } from '@/lib/acting-as';

export const dynamic = 'force-dynamic';

/**
 * 어드민 대행 콘솔 (#71) — 어드민 사이드바 안쪽에 스트리머 콘솔(사이드바·테마·페이지)을 그대로 그린다.
 * 쿠키가 URL 의 스트리머와 다르면 enter 로 보내 쿠키를 맞춘다 (목록에서 다른 스트리머를 열었을 때).
 * getMe() 는 서버 클라이언트가 쿠키를 x-acting-as 헤더로 넘기므로 대행 대상의 정보를 돌려준다.
 */
export default async function ActingLayout({ children, params }: { children: React.ReactNode; params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const acting = (await cookies()).get(ACTING_COOKIE)?.value;
  if (acting !== userId) redirect(`${actingBasePath(userId)}/enter`);

  const me = await getMe();
  if (!me) redirect('/admin/streamers?error=' + encodeURIComponent('스트리머를 찾을 수 없습니다.'));

  const user = { nickname: me.channelName, id: me.channelId, avatar: me.channelImageUrl ?? '' };
  return (
    <StreamerThemeScope theme={me.theme} className="min-h-svh">
      <SidebarProvider>
        <AppSidebarStreamer user={user} basePath={actingBasePath(userId)} exitHref="/admin/streamers/exit">
          <ActingBanner name={me.channelName} channelId={me.channelId} exitHref="/admin/streamers/exit" />
          {children}
        </AppSidebarStreamer>
      </SidebarProvider>
    </StreamerThemeScope>
  );
}
