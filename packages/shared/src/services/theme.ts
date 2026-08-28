import type { PrismaClient } from '@prisma/client';

import { DEFAULT_THEME, THEME_FONT_KEYS, type ThemeFontKey, type ThemeInput } from '../lib/theme';

/** 스트리머 테마 (#77). 행이 없으면 기본 테마를 돌려준다 — 대부분의 스트리머는 기본이다 */
export async function getTheme(prisma: PrismaClient, userId: number): Promise<ThemeInput> {
  const row = await prisma.userTheme.findUnique({ where: { userId } });
  return row ? toInput(row) : DEFAULT_THEME;
}

export async function updateTheme(prisma: PrismaClient, userId: number, input: ThemeInput) {
  const row = await prisma.userTheme.upsert({
    where: { userId },
    update: input,
    create: { userId, ...input },
  });
  return toInput(row);
}

export async function resetTheme(prisma: PrismaClient, userId: number) {
  await prisma.userTheme.deleteMany({ where: { userId } });
  return DEFAULT_THEME;
}

/** 송출 소스 토큰으로 — OBS 오버레이가 스트리머 폰트를 따라가기 위해 (#77) */
export async function getThemeBySourceToken(prisma: PrismaClient, token: string) {
  const setting = await prisma.userSetting.findFirst({
    where: { OR: [{ songSourceToken: token }, { songOverlayToken: token }] },
    select: { userId: true },
  });
  if (!setting) return null;
  return getTheme(prisma, setting.userId);
}

/** DB 행 → 공유 타입. fontKey 가 목록에서 빠진 값이면(폰트를 없앤 경우) 기본으로 */
export function toInput(row: {
  primaryColor: string | null;
  backgroundColor: string | null;
  colorScheme: ThemeInput['colorScheme'];
  fontKey: string;
}): ThemeInput {
  return {
    primaryColor: row.primaryColor,
    backgroundColor: row.backgroundColor,
    colorScheme: row.colorScheme,
    fontKey: isFontKey(row.fontKey) ? row.fontKey : 'suit',
  };
}

function isFontKey(value: string): value is ThemeFontKey {
  return (THEME_FONT_KEYS as readonly string[]).includes(value);
}
