import { NoticeList } from '@/components/notice/notice-list';
import { NoticeSeen } from '@/components/notice/notice-seen';
import { trpc } from '@/src/utils/trpc';

/** 공지사항 (#206) — 시청자 페이지 레이아웃 안에서 렌더 */
export default async function Page({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const [latest] = await trpc.notice.list.query({ limit: 1 }).catch(() => []);
  return (
    <div className="max-w-5xl">
      {latest && <NoticeSeen latestId={latest.id} />}
      <NoticeList base={`/${channelId}/notice`} />
    </div>
  );
}
