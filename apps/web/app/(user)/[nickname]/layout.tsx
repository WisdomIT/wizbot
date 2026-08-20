import { notFound } from 'next/navigation';

import { getStreamerByChannelName } from '@/app/_lib/streamers';
import { AppSidebarUser } from '@/components/app-sidebar-user';
import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { SidebarProvider } from '@/components/ui/sidebar';

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ nickname: string }>;
}>) {
  // 미들웨어의 x-url 헤더 파싱 대신 라우트 params 사용 (#23)
  const { nickname } = await params;
  const channelData = await getStreamerByChannelName(decodeURIComponent(nickname));

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
