import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_THEME, themeInputSchema } from '../../lib/theme';
import { getTheme, getThemeBySourceToken, toInput, updateTheme } from '../theme';

function createPrisma() {
  const userTheme = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockImplementation(async ({ create }: { create: object }) => ({ id: 1, ...create })),
    deleteMany: vi.fn(),
  };
  const userSetting = { findFirst: vi.fn().mockResolvedValue(null) };
  return { prisma: { userTheme, userSetting } as unknown as PrismaClient, userTheme, userSetting };
}

describe('테마 입력 검증 (#77)', () => {
  it('#RRGGBB 만 받고 소문자로 정규화한다', () => {
    const parsed = themeInputSchema.parse({ ...DEFAULT_THEME, primaryColor: '#ABCDEF' });
    expect(parsed.primaryColor).toBe('#abcdef');
    expect(() => themeInputSchema.parse({ ...DEFAULT_THEME, primaryColor: 'red' })).toThrow();
    expect(() => themeInputSchema.parse({ ...DEFAULT_THEME, primaryColor: '#abc' })).toThrow();
  });
  it('폰트는 큐레이션 목록 밖이면 거부', () => {
    expect(() => themeInputSchema.parse({ ...DEFAULT_THEME, fontKey: 'comic-sans' })).toThrow();
  });
});

describe('themeService', () => {
  it('행이 없으면 기본 테마', async () => {
    const { prisma } = createPrisma();
    await expect(getTheme(prisma, 1)).resolves.toEqual(DEFAULT_THEME);
  });
  it('저장은 upsert', async () => {
    const { prisma, userTheme } = createPrisma();
    const input = { ...DEFAULT_THEME, primaryColor: '#123456' };
    await expect(updateTheme(prisma, 1, input)).resolves.toMatchObject(input);
    expect(userTheme.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 1 } }));
  });
  it('DB 에 남은 폰트 키가 목록에서 빠졌으면 기본 폰트로', () => {
    expect(toInput({ primaryColor: null, backgroundColor: null, colorScheme: 'SYSTEM', fontKey: 'removed' }).fontKey).toBe('suit');
  });
  it('송출 토큰으로 조회 — 토큰이 없으면 null', async () => {
    const { prisma } = createPrisma();
    await expect(getThemeBySourceToken(prisma, 'nope')).resolves.toBeNull();
  });
});
