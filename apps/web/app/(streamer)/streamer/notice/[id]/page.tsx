import { NoticeArticle } from '@/components/notice/notice-article';

/** 공지사항 본문 (#206) — 콘솔 레이아웃 안에서 렌더 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="max-w-2xl py-4">
      <NoticeArticle id={id} backHref="/streamer/notice" />
    </div>
  );
}
