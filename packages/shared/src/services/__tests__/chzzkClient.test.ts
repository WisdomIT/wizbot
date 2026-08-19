import type { PrismaClient } from '@prisma/client';
import { isTokenExpired } from 'chzzk-open-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PrismaTokenStore } from '../chzzkClient';

const USER_ID = 7;
const SKEW_SECONDS = 60; // SDK 기본 expirySkewSeconds

function createPrisma() {
  const oauth = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  return { prisma: { oAuthCredential: oauth } as unknown as PrismaClient, oauth };
}

function credentialRow(expiresAt: Date) {
  return {
    id: 1,
    userId: USER_ID,
    accessToken: 'at',
    refreshToken: 'rt',
    tokenType: 'Bearer',
    expiresIn: expiresAt,
  };
}

describe('PrismaTokenStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('저장된 토큰이 없으면 null', async () => {
    const { prisma } = createPrisma();
    await expect(new PrismaTokenStore(prisma, USER_ID).get()).resolves.toBeNull();
  });

  it('get(): DB의 만료 시각을 남은 시간(expiresIn 초)으로 변환한다', async () => {
    const { prisma, oauth } = createPrisma();
    oauth.findUnique.mockResolvedValue(credentialRow(new Date(Date.now() + 3600_000)));

    const tokens = await new PrismaTokenStore(prisma, USER_ID).get();

    expect(tokens).not.toBeNull();
    expect(tokens!.accessToken).toBe('at');
    expect(tokens!.refreshToken).toBe('rt');
    // 남은 시간 ≈ 3600초 (실행 지연 감안 오차 5초)
    expect(tokens!.expiresIn).toBeGreaterThan(3595);
    expect(tokens!.expiresIn).toBeLessThanOrEqual(3600);
    // obtainedAt은 현재 시각 기준
    expect(Math.abs(tokens!.obtainedAt - Date.now())).toBeLessThan(5000);
    // 충분히 남았으므로 SDK가 만료로 판단하지 않아야 함
    expect(isTokenExpired(tokens!, SKEW_SECONDS)).toBe(false);
  });

  it('get(): 만료 임박(60초 skew 이내) 토큰은 SDK가 만료로 판단해 선제 갱신을 트리거한다', async () => {
    const { prisma, oauth } = createPrisma();
    oauth.findUnique.mockResolvedValue(credentialRow(new Date(Date.now() + 30_000))); // 30초 남음

    const tokens = await new PrismaTokenStore(prisma, USER_ID).get();
    expect(isTokenExpired(tokens!, SKEW_SECONDS)).toBe(true);
  });

  it('get(): 이미 만료된 토큰(남은 시간 음수)도 만료로 판단된다', async () => {
    const { prisma, oauth } = createPrisma();
    oauth.findUnique.mockResolvedValue(credentialRow(new Date(Date.now() - 10_000)));

    const tokens = await new PrismaTokenStore(prisma, USER_ID).get();
    expect(tokens!.expiresIn).toBeLessThanOrEqual(0);
    expect(isTokenExpired(tokens!, SKEW_SECONDS)).toBe(true);
  });

  it('set(): {obtainedAt, expiresIn}으로 정확한 절대 만료 시각을 저장한다', async () => {
    const { prisma, oauth } = createPrisma();
    const obtainedAt = 1_700_000_000_000;

    await new PrismaTokenStore(prisma, USER_ID).set({
      accessToken: 'new-at',
      refreshToken: 'new-rt',
      tokenType: 'Bearer',
      expiresIn: 86400,
      obtainedAt,
    });

    const expectedExpiresAt = new Date(obtainedAt + 86400 * 1000);
    expect(oauth.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      update: {
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        tokenType: 'Bearer',
        expiresIn: expectedExpiresAt,
      },
      create: {
        userId: USER_ID,
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        tokenType: 'Bearer',
        expiresIn: expectedExpiresAt,
      },
    });
  });

  it('set() → get() 왕복이 남은 시간을 보존한다', async () => {
    const { prisma, oauth } = createPrisma();
    const store = new PrismaTokenStore(prisma, USER_ID);

    await store.set({
      accessToken: 'at',
      refreshToken: 'rt',
      tokenType: 'Bearer',
      expiresIn: 86400,
      obtainedAt: Date.now(),
    });
    const savedExpiresAt = oauth.upsert.mock.calls[0][0].update.expiresIn as Date;
    oauth.findUnique.mockResolvedValue(credentialRow(savedExpiresAt));

    const roundTripped = await store.get();
    expect(roundTripped!.expiresIn).toBeGreaterThan(86395);
    expect(roundTripped!.expiresIn).toBeLessThanOrEqual(86400);
  });

  it('clear(): 해당 유저의 자격증명만 삭제한다', async () => {
    const { prisma, oauth } = createPrisma();
    await new PrismaTokenStore(prisma, USER_ID).clear();
    expect(oauth.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
  });
});
