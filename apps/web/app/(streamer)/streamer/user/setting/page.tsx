import { FONT_CLASS } from '@/lib/fonts';

import { AccountSettingsView } from './_components/account-settings-view';
import { ThemeSettingsView } from './_components/theme-settings-view';

export default function Page() {
  return (
    <div className="flex max-w-2xl flex-col">
      <AccountSettingsView />
      {/* next/font 클래스는 서버 모듈에서 내려준다 (#77) */}
      <ThemeSettingsView fontClasses={FONT_CLASS} />
    </div>
  );
}
