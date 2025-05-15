'use client';

import { FileAudio2, Headphones, Info, SquareChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { JSX, useEffect, useState } from 'react';

import { getStreamerByChannelName } from '@/app/_api/streamers';
import { NavSecondary } from '@/components/nav-secondary';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
} from '@/components/ui/sidebar';

import BodyBreadcrumb from './body-breadcrumb';
import { DynamicIcon } from './custom/dynamic-icon';
import { NavLogin } from './nav-login';
import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';
import { NavTitleSkeleton } from './nav-title-skeleton';

export function AppSidebarUser({ children, ...props }: React.ComponentProps<typeof Sidebar>) {
  const [channel, setChannel] = useState<{
    title: string;
    description: string;
    avatar: string;
  } | null>(null);
  const [shortcuts, setShortcuts] = useState<
    {
      name: string;
      url: string;
      icon: JSX.Element;
    }[]
  >([]);

  const pathname = usePathname();
  const currentChannelName = pathname.split('/')[1];
  const currentChannelNameDecoded = decodeURIComponent(currentChannelName);

  const data = {
    bot: [
      {
        name: '명령어',
        url: `/${currentChannelName}/command`,
        icon: <SquareChevronRight />,
      },
    ],
    song: [
      {
        name: '플레이리스트',
        url: `/${currentChannelName}/playlist`,
        icon: <Headphones />,
      },
      {
        name: '재생 기록',
        url: `/${currentChannelName}/history`,
        icon: <FileAudio2 />,
      },
    ],
    navSecondary: [
      {
        title: '사이트 정보',
        url: `/${currentChannelName}/info`,
        icon: <Info />,
      },
    ],
  };

  useEffect(() => {
    const fetchChannel = async () => {
      const channelData = await getStreamerByChannelName(currentChannelNameDecoded);
      if (channelData) {
        setChannel({
          title: channelData.channelName,
          description: '위즈봇',
          avatar: channelData.channelImageUrl,
        });
        setShortcuts(
          channelData.shortcuts.map((shortcut) => ({
            name: shortcut.name,
            url: shortcut.url,
            icon: <DynamicIcon name={shortcut.icon} />,
          })),
        );
      }
    };

    fetchChannel();
  }, [currentChannelNameDecoded]);

  return (
    <>
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          {channel ? (
            <NavTitle
              data={{
                title: channel.title,
                description: channel.description,
                avatar: channel.avatar,
              }}
            />
          ) : (
            <NavTitleSkeleton />
          )}
        </SidebarHeader>
        <SidebarContent>
          <NavMenu title="봇" items={data.bot} pathname={pathname} />
          <NavMenu title="노래" items={data.song} pathname={pathname} />
          {shortcuts.length > 0 && <NavMenu title="링크" items={shortcuts} pathname="" />}
          <NavSecondary items={data.navSecondary} className="mt-auto" />
        </SidebarContent>
        <SidebarFooter>
          <NavLogin />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <BodyBreadcrumb group={'봇'} page={'명령어'}>
          {children}
        </BodyBreadcrumb>
      </SidebarInset>
    </>
  );
}
