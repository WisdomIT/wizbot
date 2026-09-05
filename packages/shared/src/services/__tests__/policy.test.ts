import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { getById, getCurrent, listHistory } from '../policy';

function createPrisma() {
  const policyDocument = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  };
  return { prisma: { policyDocument } as unknown as PrismaClient, policyDocument };
}

describe('약관 서비스 (#252)', () => {
  it('현재 버전은 publishedAt 최신·동률이면 id 최신 순으로 조회한다', async () => {
    const { prisma, policyDocument } = createPrisma();
    policyDocument.findFirst.mockResolvedValue({ id: 9, type: 'TERMS', version: '2.0' });
    const result = await getCurrent(prisma, 'TERMS');
    expect(result).toMatchObject({ id: 9 });
    expect(policyDocument.findFirst).toHaveBeenCalledWith({
      where: { type: 'TERMS' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    });
  });

  it('현재 버전이 없으면 null', async () => {
    const { prisma, policyDocument } = createPrisma();
    policyDocument.findFirst.mockResolvedValue(null);
    expect(await getCurrent(prisma, 'PRIVACY')).toBeNull();
  });

  it('이력은 본문 없이 최신순으로 반환한다', async () => {
    const { prisma, policyDocument } = createPrisma();
    policyDocument.findMany.mockResolvedValue([]);
    await listHistory(prisma, 'TERMS');
    expect(policyDocument.findMany).toHaveBeenCalledWith({
      where: { type: 'TERMS' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, version: true, publishedAt: true },
    });
  });

  it('없는 버전 조회는 NOT_FOUND', async () => {
    const { prisma, policyDocument } = createPrisma();
    policyDocument.findUnique.mockResolvedValue(null);
    await expect(getById(prisma, 999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
