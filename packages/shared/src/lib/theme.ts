import { z } from 'zod';

/**
 * 스트리머 테마 (#77) — 서버·클라이언트가 공유하는 정의.
 * 폰트는 큐레이션 목록에서만 고른다. 임의 문자열을 받으면 오타·한글 미지원·로딩 실패를 막을 수 없다.
 * 실제 폰트 로딩(next/font)은 apps/web/lib/fonts.ts 가 이 키에 맞춰 한다.
 */
export const THEME_FONTS = [
  { key: 'suit', label: 'SUIT (기본)' },
  { key: 'noto-sans-kr', label: 'Noto Sans KR' },
  { key: 'nanum-gothic', label: '나눔고딕' },
  { key: 'nanum-myeongjo', label: '나눔명조' },
  { key: 'black-han-sans', label: '검은고딕' },
  { key: 'nanum-pen-script', label: '나눔손글씨 펜' },
  { key: 'dongle', label: '동글' },
  { key: 'jua', label: '주아' },
  { key: 'hahmlet', label: '함렛' },
  { key: 'gaegu', label: '개구' },
  { key: 'poor-story', label: '푸어스토리' },
  { key: 'gamja-flower', label: '감자꽃' },
  { key: 'yeon-sung', label: '연성' },
  { key: 'orbit', label: '오르빗' },
] as const;

export type ThemeFontKey = (typeof THEME_FONTS)[number]['key'];
export const THEME_FONT_KEYS = THEME_FONTS.map((font) => font.key) as [ThemeFontKey, ...ThemeFontKey[]];

export const THEME_SCHEMES = ['SYSTEM', 'LIGHT', 'DARK'] as const;
export type ThemeScheme = (typeof THEME_SCHEMES)[number];

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '색상은 #RRGGBB 형식이어야 합니다.')
  .transform((value) => value.toLowerCase());

export const themeInputSchema = z.object({
  /** null = 서비스 기본색 */
  primaryColor: hexColor.nullable(),
  backgroundColor: hexColor.nullable(),
  colorScheme: z.enum(THEME_SCHEMES),
  fontKey: z.enum(THEME_FONT_KEYS),
});

export type ThemeInput = z.infer<typeof themeInputSchema>;

export const DEFAULT_THEME: ThemeInput = {
  primaryColor: null,
  backgroundColor: null,
  colorScheme: 'SYSTEM',
  fontKey: 'suit',
};

/** 기본 테마와 같은가 — 그러면 래퍼를 아예 그리지 않는다 */
export function isDefaultTheme(theme: ThemeInput | null | undefined): boolean {
  if (!theme) return true;
  return (
    theme.primaryColor === null &&
    theme.backgroundColor === null &&
    theme.colorScheme === 'SYSTEM' &&
    theme.fontKey === 'suit'
  );
}
