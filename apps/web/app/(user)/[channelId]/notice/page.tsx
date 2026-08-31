import { NoticeList } from '@/components/notice/notice-list';

/** 공지사항 (#206) — 시청자 페이지 레이아웃 안에서 렌더 */
export default async function Page({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  return (
    <div className="max-w-2xl">
      <NoticeList base={`/${channelId}/notice`} />
    </div>
  );
}
