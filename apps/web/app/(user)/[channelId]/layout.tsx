import { notFound } from 'next/navigation';

import { getStreamerByChannelId } from '@/app/_lib/streamers';
import { AppSidebarUser } from '@/components/app-sidebar-user';
import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { SidebarProvider } from '@/components/ui/sidebar';

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
    <SidebarProvider>
      <AppSidebarUser channel={channel} shortcuts={shortcuts}>
        {children}
      </AppSidebarUser>
    </SidebarProvider>
  );
}
