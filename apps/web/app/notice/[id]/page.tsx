import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import Markdown from '@/components/custom/markdown';
import { trpc } from '@/src/utils/trpc';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const notice = await trpc.notice.get.query({ id: Number(id) }).catch(() => null);
  return notice ? { title: `${notice.title} · 위즈봇` } : {};
}

/** 공지사항 본문 (#206) — 마크다운(GFM) 렌더 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const notice = await trpc.notice.get.query({ id: Number(id) }).catch(() => null);
  if (!notice) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <Link href="/notice" className="text-sm text-muted-foreground hover:underline">← 공지사항</Link>
        <h1 className="text-3xl font-black">{notice.title}</h1>
        <p className="text-sm text-muted-foreground">{new Date(notice.createdAt).toLocaleString('ko-KR')}</p>
      </div>
      <article className="flex flex-col gap-1">
        <Markdown>{notice.body}</Markdown>
      </article>
    </main>
  );
}
