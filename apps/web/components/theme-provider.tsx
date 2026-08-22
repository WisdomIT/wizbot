'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';

/**
 * 라이트/다크 테마 (#85).
 *
 * globals.css 에 `.dark` 팔레트가 있는데 그 클래스를 붙이는 곳이 없어 지금까지
 * 다크 모드가 동작하지 않았다. next-themes 는 sonner 가 이미 의존하고 있었다.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      // 전환할 때 모든 요소의 transition 이 한꺼번에 도는 것을 막는다
      disableTransitionOnChange
    >
      {children}
    </NextThemeProvider>
  );
}
