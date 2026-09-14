import { redirect } from 'next/navigation';

/** 사용량은 에이전트 첫 화면이 됐다 (#297) — 옛 주소는 그리로 */
export default function Page() {
  redirect('/admin/agent');
}
