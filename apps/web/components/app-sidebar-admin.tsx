'use client';

import { ClipboardList, Inbox, ShieldCheck, Users } from 'lucide-react';
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
];

interface AppSidebarAdminProps extends React.ComponentProps<typeof Sidebar> {
  children: React.ReactNode;
  email: string;
}

export default function AppSidebarAdmin({ children, email, ...props }: AppSidebarAdminProps) {
  const pathname = usePathname();
  const currentPage = menu.find((item) => item.url === pathname)?.name;

  return (
    <>
      <Sidebar variant="inset" {...props}>
        <SidebarHeader>
          <NavTitle data={title} />
        </SidebarHeader>
        <SidebarContent>
          <NavMenu title="운영" items={menu} pathname={pathname} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={{ nickname: '관리자', id: email, avatar: '' }} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <BodyBreadcrumb group="운영" page={currentPage ?? ''}>
          {children}
        </BodyBreadcrumb>
      </SidebarInset>
    </>
  );
}
