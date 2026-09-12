import { notFound } from 'next/navigation';

import { AdminTabs } from '@/components/admin-tabs';

import { PoliciesView,POLICY_TYPE_BY_SLUG } from '../_components/policies-view';

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
