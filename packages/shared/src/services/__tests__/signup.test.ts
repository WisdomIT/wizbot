import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refreshMock = vi.fn();
const setTokensMock = vi.fn();
vi.mock('../chzzkClient', () => ({
  createChzzkClientWithStore: vi.fn(() => ({ auth: { refresh: refreshMock } })),
  getChzzkClientForUser: vi.fn(() => ({ auth: { setTokens: setTokensMock } })),
}));

import {
  approve,
  ASK_REASON_KEY,
  AUTO_APPROVE_KEY,
  autoApprove,
  getAutoApprove,
  getSettings,
  listApplications,
  PENDING_MAX_AGE_MS,
  refreshPendingTokens,
  reject,
  submitReason,
  upsertOnLogin,
} from '../signup';

const TOKENS = { accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer', expiresIn: 86400, obtainedAt: Date.now() };
const TOKEN_ROW = { accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer', tokenExpiresAt: new Date(Date.now() + 86400_000) };
const initialCommands = () => ({ initialFunction: [], initialEcho: [] });

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
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({}),
  };
  const user = { upsert: vi.fn().mockResolvedValue({ id: 42, ...IDENTITY }) };
  const userSetting = { findFirst: vi.fn().mockResolvedValue({ id: 1 }), create: vi.fn() };
  const chatbotFunctionCommand = { findFirst: vi.fn().mockResolvedValue({ id: 1 }), createMany: vi.fn() };
  const chatbotEchoCommand = { createMany: vi.fn() };
  const prisma = {
    signupApplication,
    whitelist,
    siteSetting,
    user,
    userSetting,
    chatbotFunctionCommand,
    chatbotEchoCommand,
    // 트랜잭션은 같은 mock 을 그대로 넘긴다
    $transaction: vi.fn().mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma: prisma as unknown as PrismaClient, signupApplication, whitelist, siteSetting, user };
}

describe('자동 승인 설정', () => {
  beforeEach(() => vi.clearAllMocks());

  it('설정이 없으면 꺼짐 — 기본값은 반드시 꺼짐이어야 한다', async () => {
    const { prisma } = createPrisma();
    await expect(getAutoApprove(prisma)).resolves.toBe(false);
  });

  it("'true' 문자열일 때만 켜짐", async () => {
    const { prisma, siteSetting } = createPrisma();
    siteSetting.findMany.mockResolvedValue([{ key: AUTO_APPROVE_KEY, value: 'true' }]);
    await expect(getAutoApprove(prisma)).resolves.toBe(true);
    siteSetting.findMany.mockResolvedValue([{ key: AUTO_APPROVE_KEY, value: '1' }]);
    await expect(getAutoApprove(prisma)).resolves.toBe(false);
  });

  it('사유 입력칸은 설정이 없으면 보이고, false 일 때만 숨긴다', async () => {
    const { prisma, siteSetting } = createPrisma();
    await expect(getSettings(prisma)).resolves.toEqual({ autoApprove: false, askReason: true });
    siteSetting.findMany.mockResolvedValue([{ key: ASK_REASON_KEY, value: 'false' }]);
    await expect(getSettings(prisma)).resolves.toMatchObject({ askReason: false });
  });
});

describe('upsertOnLogin — 로그인 콜백', () => {
  beforeEach(() => vi.clearAllMocks());

  it('첫 방문이면 PENDING 으로 만들고 토큰을 함께 저장한다 (#151)', async () => {
    const { prisma, signupApplication } = createPrisma();
    const result = await upsertOnLogin(prisma, IDENTITY, TOKENS);
    expect(result.created).toBe(true);
    const data = signupApplication.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ ...IDENTITY, accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer' });
    expect(data.tokenExpiresAt.getTime()).toBeCloseTo(TOKENS.obtainedAt + 86400_000, -3);
  });

  it('재방문이면 채널 정보·토큰만 갱신하고 상태는 건드리지 않는다 (거절된 채널이 로그인해도 REJECTED 유지)', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 3, ...IDENTITY, status: 'REJECTED' });
    const result = await upsertOnLogin(prisma, { ...IDENTITY, channelName: '새이름' }, TOKENS);
    expect(result.created).toBe(false);
    const data = signupApplication.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ channelName: '새이름', channelImageUrl: null, refreshToken: 'rt' });
    expect(data).not.toHaveProperty('status');
  });
});

describe('autoApprove — 신청·승인·화이트리스트를 한 번에', () => {
  it('APPROVED 로 upsert 하고 화이트리스트에 넣는다 — 로그인 중이므로 acknowledgedAt 도 찍는다', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    await autoApprove(prisma, IDENTITY);
    const create = signupApplication.upsert.mock.calls[0][0].create;
    expect(create).toMatchObject({ status: 'APPROVED' });
    expect(create.acknowledgedAt).toBeInstanceOf(Date);
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

  it('승인하면 화이트리스트 등록 + 계정 프로비저닝 + 토큰 이동 — 치지직 재조회 없이 (#151)', async () => {
    const { prisma, signupApplication, whitelist, user } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'PENDING', ...TOKEN_ROW });
    const result = await approve(prisma, 7, 1, { initialCommands });
    const data = signupApplication.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'APPROVED', processedById: 1, rejectReason: null, acknowledgedAt: null });
    // 토큰은 신청 행에서 지우고 OAuthCredential 로 옮긴다
    expect(data).toMatchObject({ accessToken: null, refreshToken: null });
    expect(whitelist.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { channelId: IDENTITY.channelId } }));
    expect(user.upsert).toHaveBeenCalled();
    expect(setTokensMock).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'at', refreshToken: 'rt' }));
    expect(result.botConnects).toBe(true);
  });

  it('토큰이 없는 신청을 승인하면 계정만 만들고 botConnects=false (재로그인 후 봇이 붙는다)', async () => {
    const { prisma, signupApplication, user } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'PENDING' });
    const result = await approve(prisma, 7, 1, { initialCommands });
    expect(user.upsert).toHaveBeenCalled();
    expect(setTokensMock).not.toHaveBeenCalled();
    expect(result.botConnects).toBe(false);
  });

  it('이미 화이트리스트에 있어도 승인은 실패하지 않는다 (upsert)', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'REJECTED' });
    whitelist.findUnique.mockResolvedValue({ id: 1 });
    await expect(approve(prisma, 7, 1, { initialCommands })).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('없는 신청은 NOT_FOUND', async () => {
    const { prisma } = createPrisma();
    await expect(approve(prisma, 99, 1, { initialCommands })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(reject(prisma, 99, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('거절은 사유가 선택이고 화이트리스트는 건드리지 않으며 토큰을 지운다', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findUnique.mockResolvedValue({ id: 7, ...IDENTITY, status: 'PENDING', ...TOKEN_ROW });
    await reject(prisma, 7, 1);
    expect(signupApplication.update.mock.calls[0][0].data).toMatchObject({
      status: 'REJECTED', rejectReason: null, processedById: 1, accessToken: null, refreshToken: null,
    });
    expect(whitelist.upsert).not.toHaveBeenCalled();
  });

  it('목록은 대기·거절만, 대기 우선 정렬 — 승인된 신청은 화이트리스트로 이동한 것으로 보고 뺀다', async () => {
    const { prisma, signupApplication, whitelist } = createPrisma();
    signupApplication.findMany.mockResolvedValue([{ id: 1, ...IDENTITY, status: 'PENDING' }]);
    whitelist.findMany.mockResolvedValue([{ channelId: IDENTITY.channelId }]);
    const rows = await listApplications(prisma);
    const args = signupApplication.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ status: { in: ['PENDING', 'REJECTED'] } });
    expect(args.orderBy).toEqual([{ status: 'asc' }, { createdAt: 'desc' }]);
    expect(rows[0].whitelisted).toBe(true);
  });
});

describe('refreshPendingTokens — 대기자 토큰 갱신 (#151)', () => {
  beforeEach(() => vi.clearAllMocks());

  function pendingRow(overrides: Record<string, unknown>) {
    return { id: 7, channelName: '테스터', createdAt: new Date(), tokenExpiresAt: new Date(Date.now() + 86400_000), ...overrides };
  }

  it('만료가 6시간 넘게 남았으면 건드리지 않는다', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findMany.mockResolvedValue([pendingRow({})]);
    await expect(refreshPendingTokens(prisma)).resolves.toEqual({ refreshed: 0, cleared: 0, candidates: 1 });
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('만료 임박이면 갱신한다', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findMany.mockResolvedValue([pendingRow({ tokenExpiresAt: new Date(Date.now() + 60_000) })]);
    refreshMock.mockResolvedValue(TOKENS);
    await expect(refreshPendingTokens(prisma)).resolves.toMatchObject({ refreshed: 1, cleared: 0 });
  });

  it('갱신에 실패하면 토큰을 지운다 (재로그인 외에 방법이 없다)', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findMany.mockResolvedValue([pendingRow({ tokenExpiresAt: new Date(Date.now() + 60_000) })]);
    refreshMock.mockRejectedValue(new Error('invalid_grant'));
    await expect(refreshPendingTokens(prisma)).resolves.toMatchObject({ refreshed: 0, cleared: 1 });
    expect(signupApplication.update).toHaveBeenCalledWith({ where: { id: 7 }, data: expect.objectContaining({ refreshToken: null }) });
  });

  it('30일 넘게 대기한 신청은 갱신하지 않고 토큰을 지운다', async () => {
    const { prisma, signupApplication } = createPrisma();
    signupApplication.findMany.mockResolvedValue([
      pendingRow({ createdAt: new Date(Date.now() - PENDING_MAX_AGE_MS - 1000), tokenExpiresAt: new Date(Date.now() + 60_000) }),
    ]);
    await expect(refreshPendingTokens(prisma)).resolves.toMatchObject({ refreshed: 0, cleared: 1 });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
