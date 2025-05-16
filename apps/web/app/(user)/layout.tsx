import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { AppSidebarUser } from '@/components/app-sidebar-user';
import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { SidebarProvider } from '@/components/ui/sidebar';

import { getStreamerByChannelName } from '../_api/streamers';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerList = await headers();
  const header_url = headerList.get('x-url') || '';
  // uri 제외 후 pathname만 남기기
  const pathname = header_url.split('/').slice(3).join('/');
  const currentChannelName = pathname.split('/')[0];
  const currentChannelNameDecoded = decodeURIComponent(currentChannelName);

  const channelData = await getStreamerByChannelName(currentChannelNameDecoded);

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
      <AppSidebarUser pathname={pathname} channel={channel} shortcuts={shortcuts}>
        {children}
      </AppSidebarUser>
    </SidebarProvider>
  );
}
