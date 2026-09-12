import { Suspense } from 'react';

import { AuditView } from './_components/audit-view';

/** 설정 변경 기록 (#175). 필터·페이지는 URL 쿼리라(#265) useSearchParams 에 Suspense 경계가 필요하다 */
export default function Page() {
  return (
    <Suspense>
      <AuditView />
    </Suspense>
  );
}
