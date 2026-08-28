import { isDefaultTheme, type ThemeInput } from '@wizbot/shared/lib/theme';
import type { ReactNode } from 'react';

import { buildThemeCss } from '@/lib/streamer-theme';
import { cn } from '@/lib/utils';

/**
 * 스트리머 테마를 하위 트리에 적용하는 래퍼 (#77).
 *
 * - 색: <style> 로 CSS 변수를 덮는다. 변수는 가장 가까운 조상이 이기므로 래퍼 안에서만 바뀐다
 * - 폰트: next/font 의 className 을 래퍼에 붙인다 — 하위가 상속한다
 * - DARK 고정: `.dark` 클래스를 래퍼에 붙여 `dark:` 유틸리티까지 따라가게 한다.
 *   LIGHT 고정은 변수로만 밝은 팔레트를 강제한다 — 방문자가 다크를 켜 둔 상태에서 `dark:`
 *   유틸리티(입력창 배경 등 일부)는 그대로 다크로 남는다. CSS 로는 "가장 가까운 조상"을
 *   클래스 선택자로 표현할 수 없어서다. 실사용에서 눈에 띄는 차이는 없다
 *
 * 기본 테마면 아무것도 감싸지 않는다 — 대부분의 스트리머가 그렇다.
 */
export function StreamerThemeScope({
  theme,
  fontClass,
  scopeId,
  className,
  children,
}: {
  theme: ThemeInput | null | undefined;
  /** FONT_CLASS[theme.fontKey] — 서버에서 넘긴다 (next/font 는 서버 모듈) */
  fontClass: string;
  /** 같은 화면에 래퍼가 둘 이상일 때 선택자가 겹치지 않게 (미리보기) */
  scopeId?: string;
  className?: string;
  children: ReactNode;
}) {
  if (!theme || isDefaultTheme(theme)) {
    return className ? <div className={className}>{children}</div> : <>{children}</>;
  }

  const id = scopeId ?? 'streamer';
  const css = buildThemeCss(theme, id);
  return (
    <div
      data-streamer-theme={id}
      className={cn(
        fontClass,
        theme.colorScheme === 'DARK' && 'dark',
        'bg-background text-foreground',
        className,
      )}
    >
      {css && <style>{css}</style>}
      {children}
    </div>
  );
}
