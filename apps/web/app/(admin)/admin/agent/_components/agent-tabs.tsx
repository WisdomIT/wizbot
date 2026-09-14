'use client';

import { AdminTabs } from '@/components/admin-tabs';

/** 에이전트 화면 탭 — 사용량이 첫 화면, 설정은 마지막 (#297) */
const TABS = [
  { name: '사용량', href: '/admin/agent', exact: true },
  { name: '사용자', href: '/admin/agent/users' },
  { name: '로그', href: '/admin/agent/logs' },
  { name: '설정', href: '/admin/agent/settings' },
];

export function AgentTabs() {
  return <AdminTabs tabs={TABS} />;
}
