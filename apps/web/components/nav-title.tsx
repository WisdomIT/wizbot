import Link from 'next/link';

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

export function NavTitle({
  data,
}: {
  data: {
    title: string;
    description: string;
    avatar: string;
  };
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link href="#">
            <div className="border border-gray-100 bg-background text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <img src={data.avatar} alt={data.avatar} />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{data.title}</span>
              <span className="truncate text-xs">{data.description}</span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
