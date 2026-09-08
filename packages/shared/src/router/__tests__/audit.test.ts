import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../../trpc';
import { appRouter } from '..';

const STREAMER = { id: 7, channelId: 'chan7', channelName: '스트리머7' };

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: STREAMER.id,
    actorType: 'STREAMER',
    actorId: STREAMER.id,
    actorName: null,
    procedure: 'command.create',
    input: { command: '!안녕' },
    createdAt: new Date('2026-09-01T00:00:00Z'),
    user: STREAMER,
    ...overrides,
  };
}

function createCaller(overrides: Partial<Context> = {}) {
  const prisma = {
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    admin: { findMany: vi.fn().mockResolvedValue([{ id: 1, email: 'admin@example.com' }]) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: STREAMER.id }) },
  };
  const ctx = { prisma, user: null, internal: false, ...overrides } as unknown as Context;
  return { caller: appRouter.createCaller(ctx), prisma };
}

const asAdmin = () => createCaller({ user: { id: 1, role: 'admin' } });

describe('audit.adminLogs (#254)', () => {
  it('관리자만 — 스트리머·비로그인은 UNAUTHORIZED', async () => {
    await expect(createCaller().caller.audit.adminLogs({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(createCaller({ user: { id: 7, role: 'streamer' } }).caller.audit.adminLogs({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('필터 없이 전체 — 채널·행위자(관리자 이메일)·입력 요약을 내린다', async () => {
    const { caller, prisma } = asAdmin();
    prisma.auditLog.findMany.mockResolvedValue([
      row(),
      row({ id: 9, actorType: 'ADMIN', actorId: 1, procedure: 'access.actingStart', input: null }),
      row({ id: 8, userId: null, user: null, actorType: 'ADMIN', actorId: 99, procedure: 'access.adminLogin', input: null }),
    ]);
    const result = await caller.audit.adminLogs({});
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({});
    expect(result.nextCursor).toBeNull();
    expect(result.logs).toMatchObject([
      { id: 10, actorLabel: '스트리머 본인', inputText: '{"command":"!안녕"}', channel: { userId: 7, channelId: 'chan7', channelName: '스트리머7' } },
      { id: 9, actorLabel: '관리자 · admin@example.com', inputText: null },
      //  지워진 관리자 계정·대상 없는 어드민 로그인
      { id: 8, actorLabel: '관리자 · #99 (삭제됨)', channel: null },
    ]);
    expect(prisma.admin.findMany).toHaveBeenCalledWith({ where: { id: { in: [1, 99] } }, select: { id: true, email: true } });
  });

  it('채널·행위자·종류(접근)·기간 필터가 where 에 반영된다', async () => {
    const { caller, prisma } = asAdmin();
    const from = new Date('2026-09-01T00:00:00Z');
    const to = new Date('2026-09-02T00:00:00Z');
    await caller.audit.adminLogs({ userId: 7, actorType: 'ADMIN', kind: 'access', from, to, cursor: 100 });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({
      id: { lt: 100 },
      userId: 7,
      actorType: 'ADMIN',
      procedure: { startsWith: 'access.' },
      createdAt: { gte: from, lte: to },
    });
  });

  it('종류=변경 은 access.* 를 제외하고, 항목을 지정하면 종류는 무시된다', async () => {
    const { caller, prisma } = asAdmin();
    await caller.audit.adminLogs({ kind: 'change' });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({ NOT: { procedure: { startsWith: 'access.' } } });
    await caller.audit.adminLogs({ kind: 'change', procedure: 'access.login' });
    expect(prisma.auditLog.findMany.mock.calls[1][0].where).toEqual({ procedure: 'access.login' });
  });

  it('limit 보다 한 건 더 오면 nextCursor 가 마지막 행 id', async () => {
    const { caller, prisma } = asAdmin();
    prisma.auditLog.findMany.mockResolvedValue([row({ id: 3 }), row({ id: 2 }), row({ id: 1 })]);
    const result = await caller.audit.adminLogs({ limit: 2 });
    expect(result.logs.map((log) => log.id)).toEqual([3, 2]);
    expect(result.nextCursor).toBe(2);
  });
});

describe('audit.recordActing (#254)', () => {
  it('대행 시작·종료를 대상 스트리머 스코프의 ADMIN 접근 기록으로 남긴다', async () => {
    const { caller, prisma } = asAdmin();
    await expect(caller.audit.recordActing({ userId: 7, phase: 'start' })).resolves.toEqual({ ok: true });
    await caller.audit.recordActing({ userId: 7, phase: 'end' });
    expect(prisma.auditLog.create.mock.calls.map((call) => call[0].data)).toEqual([
      { userId: 7, actorType: 'ADMIN', actorId: 1, procedure: 'access.actingStart' },
      { userId: 7, actorType: 'ADMIN', actorId: 1, procedure: 'access.actingEnd' },
    ]);
  });

  it('없는 스트리머는 NOT_FOUND', async () => {
    const { caller, prisma } = asAdmin();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(caller.audit.recordActing({ userId: 404, phase: 'start' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('관리자만', async () => {
    await expect(createCaller({ user: { id: 7, role: 'streamer' } }).caller.audit.recordActing({ userId: 7, phase: 'start' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('audit.logs — 스트리머 본인 (#175)', () => {
  it('접근 기록도 본인 스코프면 같은 목록에 보이고, 관리자는 익명으로', async () => {
    const { caller, prisma } = createCaller({ user: { id: 7, role: 'streamer' } });
    prisma.auditLog.findMany.mockResolvedValue([row({ actorType: 'ADMIN', actorId: 1, procedure: 'access.actingStart', input: null })]);
    const result = await caller.audit.logs({});
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toEqual({ userId: 7 });
    expect(result.logs[0]).toMatchObject({ procedure: 'access.actingStart', actorLabel: '관리자' });
  });
});
