import type { Metadata } from 'next';
import Link from 'next/link';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listManualPages } from '@/lib/manual';

export const metadata: Metadata = { title: '이용 안내 · 위즈봇' };
export const dynamic = 'force-dynamic';

export default function Page() {
  const pages = listManualPages();
  const groups = [
    { audience: 'streamer' as const, label: '스트리머 안내' },
    { audience: 'viewer' as const, label: '시청자 안내' },
  ];

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-black">위즈봇 이용 안내</h1>
        <p className="text-muted-foreground">기능별 사용 방법을 정리했습니다. 콘솔의 에이전트에게 물어봐도 같은 내용을 답합니다.</p>
      </header>
      {groups.map((group) => {
        const items = pages.filter((page) => page.audience === group.audience);
        if (items.length === 0) return null;
        return (
          <section key={group.audience} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{group.label}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((page) => (
                <Link key={page.slug} href={`/manual/${page.slug}`}>
                  <Card className="h-full transition-colors hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle className="text-base">{page.title}</CardTitle>
                      <CardDescription>{page.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
