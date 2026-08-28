import { FontLink } from '@/components/theme/font-link';
import { ALL_FONT_KEYS } from '@/lib/fonts';

import { AccountSettingsView } from './_components/account-settings-view';
import { ThemeSettingsView } from './_components/theme-settings-view';

export default function Page() {
  return (
    <div className="flex max-w-2xl flex-col">
      <AccountSettingsView />
      {/* 폰트 목록을 각 폰트로 그리기 위해 이 페이지에서만 전체를 링크한다 (#77) */}
      <FontLink keys={ALL_FONT_KEYS} />
      <ThemeSettingsView />
    </div>
  );
}
