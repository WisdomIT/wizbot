import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getStreamerByChannelId } from '@/app/_lib/streamers';
import { AppSidebarUser } from '@/components/app-sidebar-user';
import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { SidebarProvider } from '@/components/ui/sidebar';
import { TRPCReactProvider } from '@/src/utils/trpc-react';

/** 탭 제목·파비콘을 스트리머 프로필로 (#77). 이미지 URL 은 30분마다 치지직과 맞춰진다 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ channelId: string }>;
}): Promise<Metadata> {
  const { channelId } = await params;
  const channel = await getStreamerByChannelId(channelId);
  if (!channel) return {};
  return {
    title: `${channel.channelName} · 위즈봇`,
    icons: channel.channelImageUrl ? { icon: channel.channelImageUrl } : undefined,
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ channelId: string }>;
}>) {
  // 경로 식별자는 불변인 channelId (#72). 표시용 채널명은 조회 결과에서 얻는다
  const { channelId } = await params;
  const channelData = await getStreamerByChannelId(channelId);

  if (!channelData) {
    return notFound();
  }

  const channel = {
    channelId: channelData.channelId,
    title: channelData.channelName,
    description: '위즈봇',
    avatar: channelData.channelImageUrl,
  };

  const shortcuts = channelData.shortcuts.map((shortcut) => ({
    name: shortcut.name,
    url: shortcut.url,
    icon: <DynamicIcon name={shortcut.icon} />,
  }));

  return (
    // 플레이리스트·재생 기록은 클라이언트에서 조회한다 (#5 4단계)
    <TRPCReactProvider>
      {/* 스트리머 테마 — 사이드바까지 시청자 페이지 전체 (#77) */}
      <StreamerThemeScope theme={channelData.theme} className="min-h-svh">
        <SidebarProvider>
          <AppSidebarUser channel={channel} shortcuts={shortcuts}>
            {children}
          </AppSidebarUser>
        </SidebarProvider>
      </StreamerThemeScope>
    </TRPCReactProvider>
  );
}
