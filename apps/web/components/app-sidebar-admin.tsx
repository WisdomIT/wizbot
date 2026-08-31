'use client';

import { useQuery } from '@tanstack/react-query';
import { BellRing, ClipboardList, Inbox, KeyRound, Megaphone, MessageCircleQuestion, ShieldCheck, Users } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
} from '@/components/ui/sidebar';
import { useTRPC } from '@/src/utils/trpc-react';

import BodyBreadcrumb from './body-breadcrumb';
import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';
import { NavUser } from './nav-user';

const title = {
  title: '위즈봇',
  description: '관리자 콘솔',
  avatar: '/images/wisdomit.png',
  href: '/admin',
};

const menu = [
  {
    name: '사용 신청',
    url: '/admin/applications',
    icon: <Inbox />,
  },
  {
    name: '화이트리스트',
    url: '/admin/whitelist',
    icon: <ClipboardList />,
  },
  {
    name: '스트리머',
    url: '/admin/streamers',
    icon: <Users />,
  },
  {
    name: '관리자 계정',
    url: '/admin/admins',
    icon: <ShieldCheck />,
  },
  {
    name: '네이버 봇 계정',
    url: '/admin/naver-bot',
    icon: <KeyRound />,
  },
  {
    name: '공지사항',
    url: '/admin/notices',
    icon: <Megaphone />,
  },
  {
    name: '문의사항',
    url: '/admin/inquiries',
    icon: <MessageCircleQuestion />,
  },
  {
    name: '알림 설정',
    url: '/admin/webhooks',
    icon: <BellRing />,
  },
];

interface AppSidebarAdminProps extends React.ComponentProps<typeof Sidebar> {
  children: React.ReactNode;
  email: string;
}

export default function AppSidebarAdmin({ children, email, ...props }: AppSidebarAdminProps) {
  const pathname = usePathname();
  //  새 문의 점 표시 (#206 3/3) — 스레드를 열면 읽음 처리돼 꺼진다
  const trpc = useTRPC();
  const { data: inquiryUnread } = useQuery(trpc.inquiry.adminUnread.queryOptions());
  const items = menu.map((item) => (item.url === '/admin/inquiries' ? { ...item, dot: (inquiryUnread?.count ?? 0) > 0 } : item));
  const currentPage = menu.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`))?.name;
  //  어드민 대행 콘솔(#71) 안에서는 스트리머 사이드바가 자기 헤더를 그리므로 바깥 헤더를 생략한다
  const acting = /^\/admin\/streamers\/\d+(\/|$)/.test(pathname);

  return (
    <>
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <NavTitle data={title} />
        </SidebarHeader>
        <SidebarContent>
          <NavMenu title="운영" items={items} pathname={pathname} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={{ nickname: '관리자', id: email, avatar: '' }} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {acting ? children : (
          <BodyBreadcrumb group="운영" page={currentPage ?? ''}>
            {children}
          </BodyBreadcrumb>
        )}
      </SidebarInset>
    </>
  );
}
