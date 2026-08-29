'use client';

import { BotMessageSquare, FileAudio2, Image as ImageIcon, Link, ListPlus, Play, Radio, SquareChevronRight, User } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
} from '@/components/ui/sidebar';

import BodyBreadcrumb from './body-breadcrumb';
import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';
import { NavUser } from './nav-user';
import { StreamerPlayerBar } from './song/streamer-player-bar';

const group = {
  bot: '봇',
  song: '노래',
  cafe: '카페 대문 연동',
  setting: '설정',
};

const title = {
  title: '위즈봇',
  description: '스트리머 콘솔',
  avatar: '/images/wisdomit.png',
  href: '/streamer',
};

const data = {
  bot: [
    {
      name: '명령어',
      url: '/streamer/bot/command',
      icon: <SquareChevronRight />,
    },
    {
      name: '반복',
      url: '/streamer/bot/repeat',
      icon: <BotMessageSquare />,
    },
  ],
  song: [
    {
      name: '뮤직플레이어',
      url: '/streamer/song/player',
      icon: <Play />,
    },
    {
      name: '즐겨찾기',
      url: '/streamer/song/favorite',
      icon: <ListPlus />,
    },
    {
      name: '재생 기록',
      url: '/streamer/song/history',
      icon: <FileAudio2 />,
    },
  ],
  cafe: [
    {
      name: '연동 설정',
      url: '/streamer/cafe/setting',
      icon: <Radio />,
    },
    {
      name: '대문 이미지',
      url: '/streamer/cafe/editor',
      icon: <ImageIcon />,
    },
  ],
  setting: [
    {
      name: '계정 설정',
      url: '/streamer/user/setting',
      icon: <User />,
    },
    {
      name: '링크 설정',
      url: '/streamer/user/link',
      icon: <Link />,
    },
  ],
};

interface AppSidebarStreamerProps extends React.ComponentProps<typeof Sidebar> {
  children: React.ReactNode;
  /** 레이아웃(RSC)에서 조회해 내려주는 로그인 스트리머 정보 (#22) */
  user: { nickname: string; id: string; avatar: string };
}

export default function AppSidebarStreamer({ children, user, ...props }: AppSidebarStreamerProps) {
  const pathname = usePathname();

  // 경로에 해당하는 item과 group 찾기
  let currentGroup: string | undefined = undefined;
  let currentPage: string | undefined = undefined;

  for (const [key, items] of Object.entries(data)) {
    const found = items.find((item) => item.url === pathname);
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
          <NavTitle data={title} />
        </SidebarHeader>
        <SidebarContent>
          <NavMenu title="봇" items={data.bot} pathname={pathname} />
          <NavMenu title="노래" items={data.song} pathname={pathname} />
          <NavMenu title="카페 대문 연동" items={data.cafe} pathname={pathname} />
          <NavMenu title="설정" items={data.setting} pathname={pathname} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={user} viewerUrl={`/${user.id}/command`} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <BodyBreadcrumb group={currentGroup ?? ''} page={currentPage ?? ''}>
          {children}
        </BodyBreadcrumb>
        <StreamerPlayerBar />
      </SidebarInset>
    </>
  );
}
