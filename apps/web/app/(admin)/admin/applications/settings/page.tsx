import { ApplicationsTabs } from '../_components/applications-tabs';
import { SignupSettingsView } from '../_components/signup-settings-view';

/** 사용 신청 설정 (#297) — 신청 처리 규칙과 새 스트리머 초기값 */
export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <ApplicationsTabs />
      <SignupSettingsView />
    </div>
  );
}
