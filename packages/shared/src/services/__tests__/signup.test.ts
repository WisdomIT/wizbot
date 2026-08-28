import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  approve,
  AUTO_APPROVE_KEY,
  autoApprove,
  getAutoApprove,
  listApplications,
  reject,
  submitReason,
  upsertOnLogin,
} from '../signup';

const IDENTITY = { channelId: 'c'.repeat(32), channelName: '테스터', channelImageUrl: null };

function createPrisma() {
  const signupApplication = {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 7, status: 'PENDING', ...data })),
    update: vi.fn().mockImplementation(async ({ where, data }: { where: { id: number }; data: object }) => ({ id: where.id, ...IDENTITY, ...data })),
    upsert: vi.fn().mockImplementation(async ({ create }: { create: object }) => ({ id: 7, ...create })),
  };
  const whitelist = {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
  };
  const siteSetting = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    signupApplication,
    whitelist,
    siteSetting,
    // 트랜잭션은 같은 mock 을 그대로 넘긴다
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma: prisma as unknown as PrismaClient, signupApplication, whitelist, siteSetting };
}

describe('자동 승인 설정', () => {
  beforeEach(() => vi.clearAllMocks());

  it('설정이 없으면 꺼짐 — 기본값은 반드시 꺼짐이어야 한다', async () => {
    const { prisma } = createPrisma();
    await expect(getAutoApprove(prisma)).resolves.toBe(false);
  });

  it("'true' 문자열일 때만 켜짐", async () => {
    const { prisma, siteSetting } = createPrisma();
    siteSetting.findUnique.mockResolvedValue({ key: AUTO_APPROVE_KEY, value: 'true' });
    await expect(getAutoApprove(prisma)).resolves.toBe(true);
    siteSetting.findUnique.mockResolvedValue({ key: AUTO_APPROVE_KEY, value: '1' });
    await expect(getAutoApprove(prisma)).resolves.toBe(false);
  });
});

describe('upsertOnLogin — 로그인 콜백', () => {
  beforeEach(() => vi.clearAllMocks());

  it('첫 방문이면 PENDING 으로 만들고 created=true', async () => {
    const { prisma, signupApplication } = createPrisma();
    const result = await upsertOnLogin(prisma, IDENTITY);
    expect(result.created).toBe(true);
    expect(signupApplication.create).toHaveBeenCalledWith({ data: IDENTITY });
  });

  it('재방문이면 채널 정보만 갱신하고 상태는 건드리지 않는다 (거절된 채널이 로그인해도 REJECTED 유지)', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 3, ...IDENTITY, status: 'REJECTED' });
    const result = await upsertOnLogin(prisma, { ...IDENTITY, channelName: '새이름' });
    expect(result.created).toBe(false);
    const data = signupApplication.update.mock.calls[0][0].data;
    expect(data).toEqual({ channelName: '새이름', channelImageUrl: null });
    expect(data).not.toHaveProperty('status');
  });
});

describe('autoApprove — 신청·승인·화이트리스트를 한 번에', () => {
  it('APPROVED 로 upsert 하고 화이트리스트에 넣는다', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    await autoApprove(prisma, IDENTITY);
    expect(signupApplication.upsert.mock.calls[0][0].create).toMatchObject({ status: 'APPROVED' });
    expect(whitelist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { channelId: IDENTITY.channelId, nickname: IDENTITY.channelName } }),
    );
  });
});

describe('submitReason — 신청자', () => {
  beforeEach(() => vi.clearAllMocks());

  it('대기 중이면 사유만 저장, reapplied=false', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'PENDING' });
    const { reapplied } = await submitReason(prisma, 7, '  방송에 쓰려고요  ');
    expect(reapplied).toBe(false);
    expect(signupApplication.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { reason: '방송에 쓰려고요' } });
  });

  it('거절된 신청이면 PENDING 으로 되돌리고 거절 정보를 지운다 (재신청)', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'REJECTED', rejectReason: '불명확' });
    const { reapplied } = await submitReason(prisma, 7, '보완했습니다');
    expect(reapplied).toBe(true);
    expect(signupApplication.update.mock.calls[0][0].data).toEqual({
      reason: '보완했습니다', status: 'PENDING', rejectReason: null, processedAt: null, processedById: null,
    });
  });

  it('승인됐지만 화이트리스트에 없으면(해제) 재신청으로 취급', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'APPROVED' });
    whitelist.findUnique.mockResolvedValue(null);
    const { reapplied } = await submitReason(prisma, 7, '');
    expect(reapplied).toBe(true);
  });

  it('승인돼서 화이트리스트에 있으면 CONFLICT', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'APPROVED' });
    whitelist.findUnique.mockResolvedValue({ id: 1 });
    await expect(submitReason(prisma, 7, 'x')).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('빈 사유는 null 로, 500자 초과는 잘라서', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'PENDING' });
    await submitReason(prisma, 7, '   ');
    expect(signupApplication.update.mock.calls[0][0].data.reason).toBeNull();
    await submitReason(prisma, 7, 'a'.repeat(600));
    expect(signupApplication.update.mock.calls[1][0].data.reason).toHaveLength(500);
  });
});

describe('approve / reject — 어드민', () => {
  beforeEach(() => vi.clearAllMocks());

  it('승인하면 화이트리스트에 등록된다 — 치지직 재조회 없이 저장된 채널명으로', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'PENDING' });
    await approve(prisma, 7, 1);
    expect(signupApplication.update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', processedById: 1, rejectReason: null });
    expect(whitelist.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { channelId: IDENTITY.channelId } }),
    );
  });

  it('이미 화이트리스트에 있어도 승인은 실패하지 않는다 (upsert)', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'REJECTED' });
    whitelist.findUnique.mockResolvedValue({ id: 1 });
    await expect(approve(prisma, 7, 1)).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('없는 신청은 NOT_FOUND', async () => {
    const { prisma } = createPrisma();
    await expect(approve(prisma, 99, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(reject(prisma, 99, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('거절 사유는 선택이고 화이트리스트는 건드리지 않는다', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'PENDING' });
    await reject(prisma, 7, 1);
    expect(signupApplication.update.mock.calls[0][0].data).toMatchObject({ status: 'REJECTED', rejectReason: null, processedById: 1 });
    expect(whitelist.upsert).not.toHaveBeenCalled();
  });

  it('목록은 대기 우선 정렬을 요청하고 화이트리스트 여부를 붙인다', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findMany.mockResolvedValue([{ id: 1, ...IDENTITY, status: 'APPROVED' }]);
    whitelist.findMany.mockResolvedValue([{ channelId: IDENTITY.channelId }]);
    const rows = await listApplications(prisma);
    expect(signupApplication.findMany.mock.calls[0][0].orderBy).toEqual([{ status: 'asc' }, { createdAt: 'desc' }]);
    expect(rows[0].whitelisted).toBe(true);
  });
});
