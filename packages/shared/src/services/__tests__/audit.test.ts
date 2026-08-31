import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { AUDIT_EXCLUDED, auditLabel, sanitizeAuditInput } from '../../lib/audit';
import { type Context, streamerProcedure, t } from '../../trpc';

describe('sanitizeAuditInput (#175)', () => {
  it('비밀 키는 값 대신 (비공개)', () => {
    expect(sanitizeAuditInput({ url: 'x', nidAut: 'aaa', sourceToken: 'bbb', Authorization: 'c' })).toEqual({
      url: 'x', nidAut: '(비공개)', sourceToken: '(비공개)', Authorization: '(비공개)',
    });
  });
  it('긴 값은 잘라서, 배열은 20개까지', () => {
    const out = sanitizeAuditInput({ base64: 'a'.repeat(5000), list: Array.from({ length: 25 }, (_, i) => i) }) as Record<string, unknown>;
    expect(String(out.base64)).toMatch(/… \(5000자\)$/);
    expect((out.list as unknown[]).length).toBe(21);
  });
  it('중첩 객체·null·불리언 유지', () => {
    expect(sanitizeAuditInput({ a: { b: [1, true, null] } })).toEqual({ a: { b: [1, true, null] } });
  });
});

describe('감사 미들웨어 — streamerProcedure 의 mutation 기록', () => {
  const router = t.router({
    change: streamerProcedure.input(z.object({ name: z.string() })).mutation(() => 'ok'),
    'song.seek': streamerProcedure.input(z.object({ positionSeconds: z.number() })).mutation(() => 'ok'),
    'song.addToQueue': streamerProcedure.input(z.object({ url: z.string() })).mutation(() => 'ok'),
    read: streamerProcedure.query(() => 'ok'),
  });
  const db = () => {
    const create = vi.fn().mockResolvedValue({});
    return { prisma: { auditLog: { create } } as unknown as PrismaClient, create };
  };
  const call = (overrides: Partial<Context>, prisma: PrismaClient) =>
    router.createCaller({ prisma, user: null, internal: false, songSource: null, actingAs: null, ...overrides });

  it('본인 변경: actorType=STREAMER', async () => {
    const { prisma, create } = db();
    await call({ user: { id: 7, role: 'streamer' } }, prisma).change({ name: '새 이름' });
    expect(create).toHaveBeenCalledWith({
      data: { userId: 7, actorType: 'STREAMER', actorId: 7, procedure: 'change', input: { name: '새 이름' } },
    });
  });
  it('어드민 대행: actorType=ADMIN, 대상=스트리머', async () => {
    const { prisma, create } = db();
    await call({ user: { id: 1, role: 'admin' }, actingAs: { userId: 42, adminId: 1 } }, prisma).change({ name: 'x' });
    expect(create).toHaveBeenCalledWith({
      data: { userId: 42, actorType: 'ADMIN', actorId: 1, procedure: 'change', input: { name: 'x' } },
    });
  });
  it('query·제외 목록(song.seek)은 기록하지 않는다', async () => {
    const { prisma, create } = db();
    const caller = call({ user: { id: 7, role: 'streamer' } }, prisma);
    await caller.read();
    expect(AUDIT_EXCLUDED.has('song.seek')).toBe(true);
    await caller['song.seek']({ positionSeconds: 3 });
    //  대기열에 곡을 넣고 빼는 것도 제외 — 재생 기록이 이미 남는다 (사용자 확정)
    expect(AUDIT_EXCLUDED.has('song.addToQueue')).toBe(true);
    expect(AUDIT_EXCLUDED.has('notice.markAllRead')).toBe(true);
    await caller['song.addToQueue']({ url: 'x' });
    expect(create).not.toHaveBeenCalled();
  });
  it('기록 실패가 원래 작업을 깨지 않는다', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const prisma = { auditLog: { create } } as unknown as PrismaClient;
    await expect(call({ user: { id: 7, role: 'streamer' } }, prisma).change({ name: 'x' })).resolves.toBe('ok');
  });
});

describe('auditLabel', () => {
  it('알려진 경로는 한글, 모르는 경로는 원문', () => {
    expect(auditLabel('command.create')).toBe('명령어 추가');
    expect(auditLabel('unknown.path')).toBe('unknown.path');
  });
});
