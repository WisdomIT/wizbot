import { THEME_FONTS, type ThemeFontKey } from '@wizbot/shared/lib/theme';

/**
 * 스트리머 테마 폰트 (#77) — 런타임에 Google Fonts CSS 를 링크한다.
 *
 * 처음엔 next/font/google 로 빌드 시 받아 셀프호스팅했는데, 빌드가 Google Fonts 네트워크에
 * 묶여 GitHub 러너에서 ETIMEDOUT 으로 깨졌다(#154 머지 후 dev CI). 릴리즈 이미지 빌드도
 * 같은 러너라 릴리즈를 깨뜨릴 수 있다. 빌드 의존성을 없애고, 방문자 브라우저가 고른 폰트
 * 하나의 CSS 만 구글에서 받는다. 폰트 파일은 unicode-range 로 쓰이는 글자 블록만 내려온다.
 */

/** 키 → CSS font-family. suit 는 body 기본이라 null */
export const FONT_FAMILY: Record<ThemeFontKey, string | null> = {
  suit: null,
  'noto-sans-kr': "'Noto Sans KR', sans-serif",
  'nanum-gothic': "'Nanum Gothic', sans-serif",
  'nanum-myeongjo': "'Nanum Myeongjo', serif",
  'black-han-sans': "'Black Han Sans', sans-serif",
  'nanum-pen-script': "'Nanum Pen Script', cursive",
  dongle: "'Dongle', sans-serif",
  jua: "'Jua', sans-serif",
  hahmlet: "'Hahmlet', serif",
  gaegu: "'Gaegu', cursive",
  'poor-story': "'Poor Story', cursive",
  'gamja-flower': "'Gamja Flower', cursive",
  'yeon-sung': "'Yeon Sung', cursive",
  orbit: "'Orbit', sans-serif",
};

/** Google Fonts css2 의 family 파라미터. 굵기가 여럿인 폰트는 400·700 만 */
const GOOGLE_FAMILY: Record<ThemeFontKey, string | null> = {
  suit: null,
  'noto-sans-kr': 'Noto+Sans+KR:wght@400;700',
  'nanum-gothic': 'Nanum+Gothic:wght@400;700',
  'nanum-myeongjo': 'Nanum+Myeongjo:wght@400;700',
  'black-han-sans': 'Black+Han+Sans',
  'nanum-pen-script': 'Nanum+Pen+Script',
  dongle: 'Dongle:wght@400;700',
  jua: 'Jua',
  hahmlet: 'Hahmlet:wght@400;700',
  gaegu: 'Gaegu:wght@400;700',
  'poor-story': 'Poor+Story',
  'gamja-flower': 'Gamja+Flower',
  'yeon-sung': 'Yeon+Sung',
  orbit: 'Orbit',
};

/** 주어진 키들의 Google Fonts CSS URL. suit 만 있으면 null */
export function googleFontsUrl(keys: ThemeFontKey[]): string | null {
  const families = [...new Set(keys)].map((key) => GOOGLE_FAMILY[key]).filter(Boolean);
  if (families.length === 0) return null;
  const params = families.map((family) => `family=${family}`).join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/** 큐레이션 전체 — 설정 화면의 폰트 목록 미리보기용 */
export const ALL_FONT_KEYS = THEME_FONTS.map((font) => font.key);
