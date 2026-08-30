import type { ThemeFontKey } from '@wizbot/shared/lib/theme';

import { googleFontsUrl } from '@/lib/fonts';

/**
 * 폰트 CSS 링크 (#77). React 19 가 <link rel="stylesheet" precedence> 를 <head> 로 끌어올리고
 * 같은 href 는 한 번만 넣는다 — 서버·클라이언트 컴포넌트 어디서든 쓸 수 있다.
 */
export function FontLink({ keys }: { keys: ThemeFontKey[] }) {
  const href = googleFontsUrl(keys);
  if (!href) return null;
  return <link rel="stylesheet" href={href} precedence="default" />;
}
