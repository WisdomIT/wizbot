import { MarkNoticesRead } from '@/components/notice/mark-notices-read';
import { NoticeList } from '@/components/notice/notice-list';

/** 공지사항 (#206) — 콘솔 레이아웃 안에서 렌더 */
export default function Page() {
  return (
    <div className="flex max-w-3xl flex-col py-4">
      <MarkNoticesRead />
      <NoticeList base="/streamer/notice" />
    </div>
  );
}
