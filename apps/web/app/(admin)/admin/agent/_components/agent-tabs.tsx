'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/** 에이전트 화면의 탭 줄 (pelican UsageTabs 방식) — 활성 탭은 현재 URL 로 알아낸다 */
const TABS = [
  { name: '설정', href: '/admin/agent', exact: true },
  { name: '사용량', href: '/admin/agent/usage', exact: false },
  { name: '로그', href: '/admin/agent/logs', exact: false },
];

export function AgentTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b">
      {TABS.map((tab) => {
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
