'use client';

import { useQuery } from '@tanstack/react-query';
import { BellRing, Bot, ClipboardList, History, Inbox, KeyRound, Megaphone, MessageCircleQuestion, ScrollText, ShieldCheck, Users } from 'lucide-react';
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
import { SiteFooter } from './site-footer';

const title = {
  title: '위즈봇',
  description: '관리자 콘솔',
  avatar: '/images/wisdomit.png',
  href: '/admin',
};

/** 기능별 그룹 (#297) — 브레드크럼의 그룹명도 여기서 나온다 */
const groups = [
  {
    title: '스트리머',
    items: [
      { name: '스트리머', url: '/admin/streamers', icon: <Users /> },
      { name: '사용 신청', url: '/admin/applications', icon: <Inbox /> },
      { name: '화이트리스트', url: '/admin/whitelist', icon: <ClipboardList /> },
    ],
  },
  {
    title: '계정',
    items: [
      { name: '관리자 계정', url: '/admin/admins', icon: <ShieldCheck /> },
      { name: '네이버 봇 계정', url: '/admin/naver-bot', icon: <KeyRound /> },
    ],
  },
  {
    title: '게시판',
    items: [
      { name: '공지사항', url: '/admin/notices', icon: <Megaphone /> },
      { name: '문의사항', url: '/admin/inquiries', icon: <MessageCircleQuestion /> },
      { name: '약관', url: '/admin/policies', icon: <ScrollText /> },
    ],
  },
  {
    title: '에이전트',
    items: [{ name: '에이전트', url: '/admin/agent', icon: <Bot /> }],
  },
  {
    title: '운영',
    items: [
      { name: '알림 설정', url: '/admin/webhooks', icon: <BellRing /> },
      { name: '감사 기록', url: '/admin/audit', icon: <History /> },
    ],
  },
];

interface AppSidebarAdminProps extends React.ComponentProps<typeof Sidebar> {
  children: React.ReactNode;
  email: string;
}

export default function AppSidebarAdmin({ children, email, ...props }: AppSidebarAdminProps) {
  const pathname = usePathname();
  //  처리 대기 배지 (#302) — 대기 중 사용 신청·카페 가입 요청·답변 대기 문의. 1분마다 갱신, 처리 화면이 invalidate 한다
  const trpc = useTRPC();
  const { data: attention } = useQuery({ ...trpc.admin.attention.queryOptions(), refetchInterval: 60_000 });
  const BADGE: Record<string, number | undefined> = {
    '/admin/applications': attention?.applications,
    '/admin/naver-bot': attention?.joinRequests,
    '/admin/inquiries': attention?.inquiries,
  };
  const withDot = <T extends { url: string }>(item: T) => ({ ...item, badge: BADGE[item.url] });
  const isCurrent = (item: { url: string }) => pathname === item.url || pathname.startsWith(`${item.url}/`);
  const currentGroup = groups.find((group) => group.items.some(isCurrent));
  const currentPage = currentGroup?.items.find(isCurrent)?.name;
  //  어드민 대행 콘솔(#71) 안에서는 스트리머 사이드바가 자기 헤더를 그리므로 바깥 헤더를 생략한다
  const acting = /^\/admin\/streamers\/\d+(\/|$)/.test(pathname);

  return (
    <>
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <NavTitle data={title} />
        </SidebarHeader>
        <SidebarContent>
          {groups.map((group) => (
            <NavMenu key={group.title} title={group.title} items={group.items.map(withDot)} pathname={pathname} />
          ))}
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={{ nickname: '관리자', id: email, avatar: '' }} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        {acting ? children : (
          <BodyBreadcrumb group={currentGroup?.title ?? '운영'} page={currentPage ?? ''}>
            {children}
          </BodyBreadcrumb>
        )}
        <SiteFooter />
      </SidebarInset>
    </>
  );
}
