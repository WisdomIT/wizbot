import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { reportSessionCheck } from '../cafe';

const savedAt = new Date('2026-08-29T10:00:00Z');
function db(prev: { valid: boolean | null; alertedAt: Date | null } | null) {
  const update = vi.fn().mockResolvedValue({});
  const prisma = { naverBotSession: { findUnique: vi.fn().mockResolvedValue(prev && { ...prev, updatedAt: savedAt }), update } } as unknown as PrismaClient;
  return { prisma, update };
}

describe('reportSessionCheck — 만료 전이 (#9 PR4)', () => {
  it('유효 → 만료: expired (알림 대상). updatedAt(쿠키 저장 시각)은 보존 — 아니면 워커가 새 세션으로 오인해 재검사를 반복한다', async () => {
    const { prisma, update } = db({ valid: true, alertedAt: null });
    expect(await reportSessionCheck(prisma, { valid: false, message: '로그인 페이지로 이동' })).toEqual({ transition: 'expired' });
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { checkedAt: expect.any(Date), valid: false, checkMessage: '로그인 페이지로 이동', updatedAt: savedAt } });
  });
  it('이미 알린 만료는 다시 알리지 않는다', async () => {
    const { prisma } = db({ valid: false, alertedAt: new Date() });
    expect(await reportSessionCheck(prisma, { valid: false, message: 'x' })).toEqual({ transition: null });
  });
  it('만료 → 유효: recovered, alertedAt 초기화', async () => {
    const { prisma, update } = db({ valid: false, alertedAt: new Date() });
    expect(await reportSessionCheck(prisma, { valid: true, message: null })).toEqual({ transition: 'recovered' });
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { checkedAt: expect.any(Date), valid: true, checkMessage: null, updatedAt: savedAt, alertedAt: null } });
  });
  it('유효 → 유효: 전이 없음. 세션 행이 없으면 아무것도 안 한다', async () => {
    expect(await reportSessionCheck(db({ valid: true, alertedAt: null }).prisma, { valid: true, message: null })).toEqual({ transition: null });
    const none = db(null);
    expect(await reportSessionCheck(none.prisma, { valid: false, message: 'x' })).toEqual({ transition: null });
    expect(none.update).not.toHaveBeenCalled();
  });
});
