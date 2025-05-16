'use client';

import {
  BotMessageSquare,
  FileAudio2,
  Headphones,
  Link,
  ListPlus,
  Play,
  PlaySquare,
  Radio,
  SquareChevronRight,
  User,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useEffect, useState } from 'react';

import { getCurrentUser } from '@/app/login/_apis/user';
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
      name: '플레이리스트',
      url: '/streamer/song/playlist',
      icon: <Headphones />,
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
      name: '치지직',
      url: '/streamer/cafe/chzzk',
      icon: <Radio />,
    },
    {
      name: '유튜브',
      url: '/streamer/cafe/youtube',
      icon: <PlaySquare />,
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
}

export default function AppSidebarStreamer({ children, ...props }: AppSidebarStreamerProps) {
  const [user, setUser] = useState({
    nickname: '',
    id: '',
    avatar: '',
  });

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

  useEffect(() => {
    async function fetchUser() {
      const getUserData = await getCurrentUser();

      if (getUserData?.role !== 'streamer') {
        throw new Error('Unauthorized');
      }

      setUser({
        nickname: getUserData.channelName,
        id: getUserData.channelId,
        avatar: getUserData.channelImageUrl ?? '',
      });
    }
    fetchUser();
  }, [pathname]);

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
          <NavUser user={user} />
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
