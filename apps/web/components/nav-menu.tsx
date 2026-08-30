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
            <SidebarMenuButton asChild isActive={pathname === item.url}>
              <Link
                href={item.url}
                target={popup || item.popup ? '_blank' : undefined}
                rel={popup || item.popup ? 'noopener noreferrer' : undefined}
              >
                {item.icon}
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
