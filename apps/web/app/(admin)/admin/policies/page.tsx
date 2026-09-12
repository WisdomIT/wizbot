import { redirect } from 'next/navigation';

/** 약관은 종류별 탭 (#297) — 첫 화면은 이용약관 */
export default function Page() {
  redirect('/admin/policies/terms');
}
