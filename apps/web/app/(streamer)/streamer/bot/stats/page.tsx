import { Suspense } from 'react';

import { StatsView } from './_components/stats-view';

/** 명령어 사용 통계 (#276 2단계). 기간이 URL 쿼리라 useSearchParams 에 Suspense 경계가 필요하다 */
export default function Page() {
  return (
    <Suspense>
      <StatsView />
    </Suspense>
  );
}
