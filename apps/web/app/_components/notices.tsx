import Link from 'next/link';

import { trpc } from '@/src/utils/trpc';

/** 랜딩의 최근 공지 (#206). 없으면 섹션째 숨긴다 */
export default async function Notices() {
  const notices = await trpc.notice.list.query({ limit: 3 }).catch(() => []);
  if (notices.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-bold">공지사항</h2>
        <Link href="/notice" className="text-sm text-muted-foreground hover:underline">전체 보기</Link>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border px-4">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Link href={`/notice/${notice.id}`} className="flex items-baseline justify-between gap-4 py-3 hover:underline">
              <span className="truncate">{notice.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleDateString('ko-KR')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
