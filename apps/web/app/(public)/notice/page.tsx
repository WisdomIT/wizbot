import type { Metadata } from 'next';

import { NoticeList } from '@/components/notice/notice-list';

export const metadata: Metadata = { title: '공지사항 · 위즈봇' };
export const dynamic = 'force-dynamic';

/** 공지사항 목록 (#206) — 공개 페이지 (랜딩에서 진입) */
export default function Page() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <NoticeList base="/notice" />
    </main>
  );
}
