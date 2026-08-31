import type { Metadata } from 'next';
import Link from 'next/link';

import { trpc } from '@/src/utils/trpc';

export const metadata: Metadata = { title: '공지사항 · 위즈봇' };
export const dynamic = 'force-dynamic';

/** 공지사항 목록 (#206) — 공개 페이지. 랜딩·콘솔·시청자 페이지에서 들어온다 */
export default async function Page() {
  const notices = await trpc.notice.list.query({ limit: 50 }).catch(() => []);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <h1 className="text-3xl font-black">공지사항</h1>
      {notices.length === 0 ? (
        <p className="text-muted-foreground">등록된 공지사항이 없습니다.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {notices.map((notice) => (
            <li key={notice.id}>
              <Link href={`/notice/${notice.id}`} className="flex items-baseline justify-between gap-4 py-3 hover:underline">
                <span className="font-medium">{notice.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleDateString('ko-KR')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
