'use client';

import {
  BotMessageSquare,
  FileAudio2,
  Headphones,
  Info,
  Link,
  ListPlus,
  Play,
  PlaySquare,
  Radio,
  SquareChevronRight,
  User,
} from 'lucide-react';
import * as React from 'react';

import { NavSecondary } from '@/components/nav-secondary';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';

import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';
import { NavUser } from './nav-user';

const data = {
  title: {
    title: '위즈봇',
    description: '스트리머 콘솔',
    avatar: '#',
  },
  user: {
    nickname: '빅헤드',
    id: 'ca1850b2eceb7f86146695fd9bb9cefc',
    avatar:
      'https://nng-phinf.pstatic.net/MjAyMzEyMTlfMzYg/MDAxNzAyOTcwODY1OTUy.1hHkqzH-zyEhyW2EJNfj1q6r7XTDeQNNqL_owQQ6AFwg.mCjDaHbdF0jjfhB2PvFuFJLxL9jQ-PV0oSLLDRXoGLUg.GIF/popHEAD.gif',
  },
  bot: [
    {
      name: '명령어',
      url: '#',
      icon: SquareChevronRight,
    },
    {
      name: '반복',
      url: '#',
      icon: BotMessageSquare,
    },
  ],
  song: [
    {
      name: '뮤직플레이어',
      url: '#',
      icon: Play,
    },
    {
      name: '플레이리스트',
      url: '#',
      icon: Headphones,
    },
    {
      name: '즐겨찾기',
      url: '#',
      icon: ListPlus,
    },
    {
      name: '재생 기록',
      url: '#',
      icon: FileAudio2,
    },
  ],
  cafe: [
    {
      name: '치지직',
      url: '#',
      icon: Radio,
    },
    {
      name: '유튜브',
      url: '#',
      icon: PlaySquare,
    },
  ],
  setting: [
    {
      name: '계정 설정',
      url: '#',
      icon: User,
    },
    {
      name: '링크 설정',
      url: '#',
      icon: Link,
    },
  ],
  navSecondary: [
    {
      title: '사이트 정보',
      url: '#',
      icon: Info,
    },
  ],
};

export function AppSidebarStreamer({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <NavTitle data={data.title} />
      </SidebarHeader>
      <SidebarContent>
        <NavMenu title="봇" items={data.bot} />
        <NavMenu title="노래" items={data.song} />
        <NavMenu title="카페 대문 연동" items={data.cafe} />
        <NavMenu title="설정" items={data.setting} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
