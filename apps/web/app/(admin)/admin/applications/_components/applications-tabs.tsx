'use client';

import { AdminTabs } from '@/components/admin-tabs';

/** 사용 신청 화면 탭 (#297) — 신청 목록 / 설정 */
const TABS = [
  { name: '신청', href: '/admin/applications', exact: true },
  { name: '설정', href: '/admin/applications/settings' },
];

export function ApplicationsTabs() {
  return <AdminTabs tabs={TABS} />;
}
