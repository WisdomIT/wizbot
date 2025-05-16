'use client';

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
              <a
                href={item.url}
                target={popup ? '_blank' : undefined}
                rel={popup ? 'noopener noreferrer' : undefined}
              >
                {item.icon}
                <span>{item.name}</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
