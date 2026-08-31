import type { Metadata } from 'next';

import { NoticeArticle } from '@/components/notice/notice-article';
import { trpc } from '@/src/utils/trpc';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const notice = await trpc.notice.get.query({ id: Number(id) }).catch(() => null);
  return notice ? { title: `${notice.title} · 위즈봇` } : {};
}

/** 공지사항 본문 (#206) — 공개 페이지 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <NoticeArticle id={id} backHref="/notice" />
    </main>
  );
}
