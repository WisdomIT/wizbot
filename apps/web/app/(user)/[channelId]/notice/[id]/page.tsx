import { NoticeArticle } from '@/components/notice/notice-article';

/** 공지사항 본문 (#206) — 시청자 페이지 레이아웃 안에서 렌더 */
export default async function Page({ params }: { params: Promise<{ channelId: string; id: string }> }) {
  const { channelId, id } = await params;
  return (
    <div className="max-w-3xl">
      <NoticeArticle id={id} backHref={`/${channelId}/notice`} />
    </div>
  );
}
