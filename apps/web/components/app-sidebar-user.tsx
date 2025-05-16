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
import { NavLogin } from './nav-login';
import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';
import { NavTitleSkeleton } from './nav-title-skeleton';

const group = {
  bot: '봇',
  song: '노래',
  navSecondary: '사이트',
};

interface AppSidebarUserProps extends React.ComponentProps<typeof Sidebar> {
  pathname: string;
  channel: {
    title: string;
    description: string;
    avatar: string;
  };
  shortcuts: {
    name: string;
    url: string;
    icon: JSX.Element;
  }[];
  children: React.ReactNode;
}

export function AppSidebarUser({
  pathname,
  channel,
  shortcuts,
  children,
  ...props
}: AppSidebarUserProps) {
  const data = {
    bot: [
      {
        name: '명령어',
        url: `/${channel.title}/command`,
        icon: <SquareChevronRight />,
      },
    ],
    song: [
      {
        name: '플레이리스트',
        url: `/${channel.title}/playlist`,
        icon: <Headphones />,
      },
      {
        name: '재생 기록',
        url: `/${channel.title}/history`,
        icon: <FileAudio2 />,
      },
    ],
    navSecondary: [
      {
        name: '사이트 정보',
        url: `/${channel.title}/info`,
        icon: <Info />,
      },
    ],
  };

  const pathnameDecoded = decodeURIComponent(pathname);

  // 경로에 해당하는 item과 group 찾기
  let currentGroup: string | undefined = undefined;
  let currentPage: string | undefined = undefined;

  for (const [key, items] of Object.entries(data)) {
    const found = items.find((item) => item.url === '/' + pathnameDecoded);
    if (found) {
      currentGroup = group[key as keyof typeof group];
      currentPage = found.name;
      break;
    }
  }

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
                href: `/${channel.title}`,
              }}
            />
          ) : (
            <NavTitleSkeleton />
          )}
        </SidebarHeader>
        <SidebarContent>
          <NavMenu title="봇" items={data.bot} pathname={pathname} />
          <NavMenu title="노래" items={data.song} pathname={pathname} />
          {shortcuts.length > 0 && <NavMenu title="링크" items={shortcuts} pathname="" popup />}
          <NavSecondary items={data.navSecondary} className="mt-auto" />
        </SidebarContent>
        <SidebarFooter>
          <NavLogin />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <BodyBreadcrumb group={currentGroup ?? ''} page={currentPage ?? ''}>
          {children}
        </BodyBreadcrumb>
      </SidebarInset>
    </>
  );
}
