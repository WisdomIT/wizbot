'use client';

import { useQuery } from '@tanstack/react-query';
import { FileAudio2, Headphones, Info, Megaphone, SquareChevronRight } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { JSX, useEffect, useState } from 'react';

import { NavSecondary } from '@/components/nav-secondary';
import { VIEWER_NOTICE_SEEN_EVENT, VIEWER_NOTICE_SEEN_KEY } from '@/components/notice/notice-seen';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
} from '@/components/ui/sidebar';
import { useTRPC } from '@/src/utils/trpc-react';

import BodyBreadcrumb from './body-breadcrumb';
import { NavLogin } from './nav-login';
import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';
import { NavTitleSkeleton } from './nav-title-skeleton';
import { ViewerPlayerBar } from './song/viewer-player-bar';

const group = {
  bot: '봇',
  song: '노래',
  navSecondary: '사이트',
};

interface AppSidebarUserProps extends React.ComponentProps<typeof Sidebar> {
  channel: {
    /** 경로 식별자 — 표시용 title 이 아니라 불변인 channelId 를 쓴다 (#72) */
    channelId: string;
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
  //  새 공지 점 표시 (#206) — 비로그인 시청자도 있어 localStorage(마지막으로 본 공지 id) 기준
  const trpc = useTRPC();
  const { data: latestNotices } = useQuery(trpc.notice.list.queryOptions({ limit: 1 }));
  const latestId = latestNotices?.[0]?.id ?? 0;
  const [seenId, setSeenId] = useState(Number.MAX_SAFE_INTEGER);
  useEffect(() => {
    const read = () => {
      try {
        setSeenId(Number(localStorage.getItem(VIEWER_NOTICE_SEEN_KEY) ?? 0));
      } catch {
        setSeenId(Number.MAX_SAFE_INTEGER);
      }
    };
    read();
    window.addEventListener(VIEWER_NOTICE_SEEN_EVENT, read);
    return () => window.removeEventListener(VIEWER_NOTICE_SEEN_EVENT, read);
  }, []);
  const hasNewNotice = latestId > seenId;

  const data = {
    bot: [
      {
        name: '명령어',
        url: `/${channel.channelId}/command`,
        icon: <SquareChevronRight />,
      },
    ],
    song: [
      {
        name: '플레이리스트',
        url: `/${channel.channelId}/playlist`,
        icon: <Headphones />,
      },
      {
        name: '재생 기록',
        url: `/${channel.channelId}/history`,
        icon: <FileAudio2 />,
      },
    ],
    navSecondary: [
      {
        name: '공지사항',
        url: `/${channel.channelId}/notice`,
        icon: <Megaphone />,
        dot: hasNewNotice,
      },
      {
        name: '사이트 정보',
        url: `/${channel.channelId}/info`,
        icon: <Info />,
      },
    ],
  };

  const pathname = usePathname();

  const [currentPage, setCurrentPage] = useState<string | null>(null);
  const [currentGroup, setCurrentGroup] = useState<string | null>(null);

  useEffect(() => {
    for (const [key, items] of Object.entries(data)) {
      //  상세 경로(/{channelId}/notice/3 등)도 해당 메뉴로 (#206)
      const found = items.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`));
      if (found) {
        setCurrentGroup(group[key as keyof typeof group]);
        setCurrentPage(found.name);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
          <NavSecondary items={data.navSecondary} className="mt-auto" pathname={pathname} />
        </SidebarContent>
        <SidebarFooter>
          <NavLogin />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <BodyBreadcrumb group={currentGroup ?? ''} page={currentPage ?? ''}>
          {children}
        </BodyBreadcrumb>
        <ViewerPlayerBar channelId={channel.channelId} />
      </SidebarInset>
    </>
  );
}
