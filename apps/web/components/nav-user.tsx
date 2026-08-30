'use client';

import { ChevronsUpDown, ExternalLink, LogOut } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

export function NavUser({
  user,
  viewerUrl,
  hideLogout = false,
}: {
  user: {
    nickname: string;
    id: string;
    avatar: string;
  };
  /** 있으면 드롭다운에 '내 시청자 페이지' 항목을 노출한다 (#7) */
  viewerUrl?: string;
  /** 어드민 대행(#71) — 여기서 로그아웃하면 어드민 자신의 세션이 끊기므로 숨긴다 */
  hideLogout?: boolean;
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg border border-gray-100">
                <AvatarImage src={user.avatar} alt={user.nickname} />
                <AvatarFallback className="rounded-lg">{user.nickname.slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.nickname}</span>
                <span className="truncate text-xs">{user.id}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'top'}
            align="end"
            sideOffset={4}
          >
            {viewerUrl && (
              <>
                <DropdownMenuItem asChild>
                  <a href={viewerUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />내 시청자 페이지
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {!hideLogout && (
              <DropdownMenuItem
                onClick={() => {
                  location.href = '/login/logout';
                }}
              >
                <LogOut />
                로그아웃
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
