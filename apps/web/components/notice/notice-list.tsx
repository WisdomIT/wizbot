import Link from 'next/link';

import { trpc } from '@/src/utils/trpc';

/** 공지 목록 (#206) — 랜딩·공개 페이지·콘솔·시청자 페이지가 공유한다. base 에 따라 상세 링크만 달라진다 */
export async function NoticeList({ base, limit = 50 }: { base: string; limit?: number }) {
  const notices = await trpc.notice.list.query({ limit }).catch(() => []);

  if (notices.length === 0) {
    return <p className="text-muted-foreground">등록된 공지사항이 없습니다.</p>;
  }
  return (
    <ul className="flex flex-col divide-y">
      {notices.map((notice) => (
        <li key={notice.id}>
          <Link href={`${base}/${notice.id}`} className="flex items-baseline justify-between gap-4 py-3 hover:underline">
            <span className="font-medium">{notice.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleDateString('ko-KR')}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
