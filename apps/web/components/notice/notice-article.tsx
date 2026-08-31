import Link from 'next/link';
import { notFound } from 'next/navigation';

import Markdown from '@/components/custom/markdown';
import { trpc } from '@/src/utils/trpc';

/** 공지 본문 (#206) — 마크다운(GFM) 렌더. 공개 페이지·콘솔·시청자 페이지가 공유한다 */
export async function NoticeArticle({ id, backHref }: { id: string; backHref: string }) {
  if (!/^\d+$/.test(id)) notFound();
  const notice = await trpc.notice.get.query({ id: Number(id) }).catch(() => null);
  if (!notice) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={backHref} className="text-sm text-muted-foreground hover:underline">← 공지사항</Link>
        <h1 className="text-3xl font-black">{notice.title}</h1>
        <p className="text-sm text-muted-foreground">{new Date(notice.createdAt).toLocaleString('ko-KR')}</p>
      </div>
      <article>
        <Markdown>{notice.body}</Markdown>
      </article>
    </div>
  );
}
