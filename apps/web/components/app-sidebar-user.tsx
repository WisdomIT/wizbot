'use client';

import {
  Coffee,
  FileAudio2,
  Frame,
  Headphones,
  Info,
  Map,
  PieChart,
  PlaySquare,
  Radio,
  SquareChevronRight,
} from 'lucide-react';
import * as React from 'react';

import { NavSecondary } from '@/components/nav-secondary';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';

import { NavLogin } from './nav-login';
import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';

const data = {
  user: {
    title: '빅헤드',
    description: '위즈봇',
    avatar:
      'https://nng-phinf.pstatic.net/MjAyMzEyMTlfMzYg/MDAxNzAyOTcwODY1OTUy.1hHkqzH-zyEhyW2EJNfj1q6r7XTDeQNNqL_owQQ6AFwg.mCjDaHbdF0jjfhB2PvFuFJLxL9jQ-PV0oSLLDRXoGLUg.GIF/popHEAD.gif',
  },
  bot: [
    {
      name: '명령어',
      url: '#',
      icon: SquareChevronRight,
    },
  ],
  song: [
    {
      name: '플레이리스트',
      url: '#',
      icon: Headphones,
    },
    {
      name: '재생 기록',
      url: '#',
      icon: FileAudio2,
    },
  ],
  links: [
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
    {
      name: '숏헤드',
      url: '#',
      icon: PlaySquare,
    },
    {
      name: '카페',
      url: '#',
      icon: Coffee,
    },
  ],
  projects: [
    {
      name: 'Design Engineering',
      url: '#',
      icon: Frame,
    },
    {
      name: 'Sales & Marketing',
      url: '#',
      icon: PieChart,
    },
    {
      name: 'Travel',
      url: '#',
      icon: Map,
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

export function AppSidebarUser({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <NavTitle data={data.user} />
      </SidebarHeader>
      <SidebarContent>
        <NavMenu title="봇" items={data.bot} />
        <NavMenu title="노래" items={data.song} />
        <NavMenu title="링크" items={data.links} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavLogin />
      </SidebarFooter>
    </Sidebar>
  );
}
