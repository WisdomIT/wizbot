import { notFound } from 'next/navigation';

import { AdminTabs } from '@/components/admin-tabs';

import { PoliciesView } from '../_components/policies-view';

/**
 * 경로 조각 → 종류. 서버 컴포넌트에서 쓰므로 여기 둔다 — 'use client' 모듈에서 가져온 객체는
 * 서버에서 클라이언트 참조로 바뀌어 값을 읽을 수 없다 (실측: 항상 notFound → 404)
 */
const POLICY_TYPE_BY_SLUG: Record<string, 'TERMS' | 'PRIVACY' | undefined> = { terms: 'TERMS', privacy: 'PRIVACY' };

const TABS = [
  { name: '서비스 이용약관', href: '/admin/policies/terms' },
  { name: '개인정보처리방침', href: '/admin/policies/privacy' },
];

/** 약관 관리 (#252 #297) — 종류별 탭. 각 탭은 그 종류의 버전만 보이고 새 버전도 그 종류로 고정 */
export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const policyType = POLICY_TYPE_BY_SLUG[type];
  if (!policyType) notFound();
  return (
    <div className="flex flex-col gap-2">
      <AdminTabs tabs={TABS} />
      <PoliciesView type={policyType} />
    </div>
  );
}
