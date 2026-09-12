'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

export interface AdminTab {
  name: string;
  href: string;
  /** true 면 경로가 정확히 같을 때만 활성 — 첫 탭(부모 경로)에 쓴다 */
  exact?: boolean;
}

/** 어드민 화면의 탭 줄 (#297, pelican UsageTabs 방식) — 활성 탭은 현재 URL 로 알아낸다. 에이전트·사용 신청·약관이 같이 쓴다 */
export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'border-b-2 px-3 py-2 text-sm',
              active ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}
