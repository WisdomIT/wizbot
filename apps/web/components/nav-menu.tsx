'use client';

import Link from 'next/link';
import { JSX } from 'react';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function NavMenu({
  title,
  items,
  pathname,
  popup = false,
}: {
  title: string;
  items: {
    name: string;
    url: string;
    icon: JSX.Element;
    /** 이 항목만 새 창으로 (그룹 전체 popup 과 별개) */
    popup?: boolean;
    /** 새 글 표시 — 안 읽은 것이 있을 때 점을 띄운다 (#206) */
    dot?: boolean;
  }[];
  pathname: string;
  popup?: boolean;
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.name}>
            <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(`${item.url}/`)}>
              <Link
                href={item.url}
                target={popup || item.popup ? '_blank' : undefined}
                rel={popup || item.popup ? 'noopener noreferrer' : undefined}
              >
                {item.icon}
                <span>{item.name}</span>
                {item.dot && <span aria-label="새 글" className="ml-auto size-2 shrink-0 rounded-full bg-red-500" />}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
