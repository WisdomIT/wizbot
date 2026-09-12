import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/nodemailer', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
}));

import { sendMail } from '../../lib/nodemailer';
import type { Context } from '../../trpc';
import { appRouter } from '..';

const ADMIN = { id: 1, email: 'admin@example.com' };

function createCaller(overrides: Partial<Context> = {}) {
  const adminLogin = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    admin: {
      findFirst: vi.fn().mockResolvedValue(ADMIN),
      findUnique: vi.fn().mockResolvedValue(ADMIN),
    },
    adminLogin,
    whitelist: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    signupApplication: { findMany: vi.fn().mockResolvedValue([]) },
    //  접근 기록 (#254)
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const ctx = { prisma, user: null, internal: false, ...overrides } as unknown as Context;
  return { caller: appRouter.createCaller(ctx), prisma };
}

function passcodeRow(passcode: string, ageMs: number) {
  return { adminId: ADMIN.id, passcode, createdAt: new Date(Date.now() - ageMs) };
}

describe('admin.login (#20)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('존재하지 않는 계정도 동일한 ok 응답 (존재 여부 비노출)', async () => {
    const { caller, prisma } = createCaller();
    prisma.admin.findFirst.mockResolvedValue(null);
    await expect(caller.admin.login({ email: 'nobody@example.com' })).resolves.toEqual({
      ok: true,
    });
    expect(sendMail).not.toHaveBeenCalled();
    expect(prisma.adminLogin.upsert).not.toHaveBeenCalled();
  });

  it('정상 계정이면 패스코드 저장 + 메일 발송', async () => {
    const { caller, prisma } = createCaller();
    await expect(caller.admin.login({ email: ADMIN.email })).resolves.toEqual({ ok: true });
    expect(prisma.adminLogin.upsert).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it('쿨다운(60초) 내 재요청은 재발급/재발송하지 않는다', async () => {
    const { caller, prisma } = createCaller();
    prisma.adminLogin.findUnique.mockResolvedValue(passcodeRow('abc123', 30 * 1000));
    await expect(caller.admin.login({ email: ADMIN.email })).resolves.toEqual({ ok: true });
    expect(prisma.adminLogin.upsert).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('쿨다운 경과 후에는 새 패스코드 발급', async () => {
    const { caller, prisma } = createCaller();
    prisma.adminLogin.findUnique.mockResolvedValue(passcodeRow('abc123', 61 * 1000));
    await caller.admin.login({ email: ADMIN.email });
    expect(prisma.adminLogin.upsert).toHaveBeenCalled();
  });
});

describe('admin.loginCheck (#20)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('올바른 코드 + 유효시간 내 → 성공, 패스코드 소모', async () => {
    const { caller, prisma } = createCaller();
    prisma.adminLogin.findUnique.mockResolvedValue(passcodeRow('good12', 60 * 1000));
    await expect(caller.admin.loginCheck({ email: ADMIN.email, code: 'good12' })).resolves.toEqual({
      id: ADMIN.id,
    });
    expect(prisma.adminLogin.deleteMany).toHaveBeenCalled();
    //  접근 기록 (#254) — 대상 스트리머 없이 관리자 로그인만
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: { userId: null, actorType: 'ADMIN', actorId: ADMIN.id, procedure: 'access.adminLogin' },
    });
  });

  it('잘못된 코드 → 실패하되 패스코드는 소모된다 (코드당 1회 시도)', async () => {
    const { caller, prisma } = createCaller();
    prisma.adminLogin.findUnique.mockResolvedValue(passcodeRow('good12', 1000));
    await expect(
      caller.admin.loginCheck({ email: ADMIN.email, code: 'wrong1' }),
    ).rejects.toBeInstanceOf(TRPCError);
    expect(prisma.adminLogin.deleteMany).toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('TTL(10분) 초과 코드 → 만료 처리', async () => {
    const { caller, prisma } = createCaller();
    prisma.adminLogin.findUnique.mockResolvedValue(passcodeRow('good12', 11 * 60 * 1000));
    await expect(
      caller.admin.loginCheck({ email: ADMIN.email, code: 'good12' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('없는 계정도 동일한 오류 메시지 (존재 여부 비노출)', async () => {
    const { caller, prisma } = createCaller();
    prisma.admin.findFirst.mockResolvedValue(null);
    await expect(
      caller.admin.loginCheck({ email: 'nobody@example.com', code: 'any' }),
    ).rejects.toMatchObject({ message: '유효하지 않거나 만료된 링크입니다.' });
  });
});

describe('admin 화이트리스트 API 권한', () => {
  it('비로그인/스트리머는 UNAUTHORIZED', async () => {
    const { caller } = createCaller();
    await expect(caller.admin.listWhitelist()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const { caller: streamerCaller } = createCaller({ user: { id: 1, role: 'streamer' } });
    await expect(streamerCaller.admin.listWhitelist()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('관리자는 조회 가능', async () => {
    const { caller } = createCaller({ user: { id: 1, role: 'admin' } });
    await expect(caller.admin.listWhitelist()).resolves.toEqual([]);
  });
});

describe('admin.attention (#302)', () => {
  it('대기 신청·가입 요청·답변 대기 문의 건수 — 관리자만', async () => {
    const { caller, prisma } = createCaller({ user: { id: 1, role: 'admin' } });
    const p = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
    p.signupApplication.count = vi.fn().mockResolvedValue(3);
    p.cafeIntegration = { count: vi.fn().mockResolvedValue(1) };
    p.inquiry = { count: vi.fn().mockResolvedValue(2) };
    await expect(caller.admin.attention()).resolves.toEqual({ applications: 3, joinRequests: 1, inquiries: 2 });
    expect(p.signupApplication.count).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
    expect(p.cafeIntegration.count).toHaveBeenCalledWith({ where: { status: 'JOIN_REQUESTED' } });
    expect(p.inquiry.count).toHaveBeenCalledWith({ where: { status: 'OPEN' } });
    await expect(createCaller({ user: { id: 7, role: 'streamer' } }).caller.admin.attention()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
