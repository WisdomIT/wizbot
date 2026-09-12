import { Suspense } from 'react';

import { AdminAuditView } from './_components/admin-audit-view';

/** 어드민 감사 기록 (#254) — 전체 변경 기록 + 접근 기록. 필터·페이지는 URL 쿼리라(#265) Suspense 경계가 필요하다 */
export default function Page() {
  return (
    <Suspense>
      <AdminAuditView />
    </Suspense>
  );
}
