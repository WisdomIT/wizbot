'use client';

import { FileAudio2, Headphones, Info, SquareChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { JSX, useEffect, useState } from 'react';

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

export function AppSidebarUser({ channel, shortcuts, children, ...props }: AppSidebarUserProps) {
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

  const pathname = usePathname();
  const pathnameDecoded = decodeURIComponent(pathname);

  const [currentPage, setCurrentPage] = useState<string | null>(null);
  const [currentGroup, setCurrentGroup] = useState<string | null>(null);

  useEffect(() => {
    for (const [key, items] of Object.entries(data)) {
      const found = items.find((item) => item.url === pathnameDecoded);
      if (found) {
        setCurrentGroup(group[key as keyof typeof group]);
        setCurrentPage(found.name);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathnameDecoded]);

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
          <NavMenu title="봇" items={data.bot} pathname={pathnameDecoded} />
          <NavMenu title="노래" items={data.song} pathname={pathnameDecoded} />
          {shortcuts.length > 0 && <NavMenu title="링크" items={shortcuts} pathname="" popup />}
          <NavSecondary items={data.navSecondary} className="mt-auto" pathname={pathnameDecoded} />
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
