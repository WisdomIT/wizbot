import Link from 'next/link';

import { listManualPages } from '@/lib/manual';

export const dynamic = 'force-dynamic';

/** 이용 안내 (#35 3/3) — 공개 페이지. 좌측 목차는 대상 독자(스트리머/시청자)로 묶는다 */
export default function ManualLayout({ children }: { children: React.ReactNode }) {
  const pages = listManualPages();
  const groups = [
    { audience: 'streamer' as const, label: '스트리머 안내' },
    { audience: 'viewer' as const, label: '시청자 안내' },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-8 px-4 py-12">
      <aside className="hidden w-52 shrink-0 md:block">
        <nav className="sticky top-8 flex flex-col gap-5">
          <Link href="/manual" className="text-sm font-semibold hover:underline">
            위즈봇 이용 안내
          </Link>
          {groups.map((group) => {
            const items = pages.filter((page) => page.audience === group.audience);
            if (items.length === 0) return null;
            return (
              <div key={group.audience} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
                {items.map((page) => (
                  <Link key={page.slug} href={`/manual/${page.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
                    {page.title}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
