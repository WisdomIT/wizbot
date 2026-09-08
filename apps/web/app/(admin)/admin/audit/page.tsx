import { AdminAuditView } from './_components/admin-audit-view';

/** 어드민 감사 기록 (#254) — 전체 변경 기록 + 접근 기록 */
export default function Page() {
  return (
    <div>
      <AdminAuditView />
    </div>
  );
}
