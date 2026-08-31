import { NoticeList } from '@/components/notice/notice-list';

/** 공지사항 (#206) — 콘솔 레이아웃 안에서 렌더 */
export default function Page() {
  return (
    <div className="max-w-2xl py-4">
      <NoticeList base="/streamer/notice" />
    </div>
  );
}
