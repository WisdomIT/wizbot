import { Suspense } from 'react';

import { HistoryView } from './_components/history-view';

export default function Page() {
  return (
    <div>
      {/* 상태·검색어 필터가 URL 쿼리라(#265) useSearchParams 에 Suspense 경계가 필요하다 */}
      <Suspense>
        <HistoryView />
      </Suspense>
    </div>
  );
}
