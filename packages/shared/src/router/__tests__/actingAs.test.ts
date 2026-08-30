import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { adminProcedure, type Context, streamerProcedure, t } from '../../trpc';

/** 대행 판정만 본다 — 실제 라우터 대신 최소 라우터로 (#71) */
const router = t.router({
  whoami: streamerProcedure.query(({ ctx }) => ctx.user),
  adminOnly: adminProcedure.query(({ ctx }) => ctx.user),
});
const caller = (overrides: Partial<Context>) =>
  router.createCaller({ prisma: {} as PrismaClient, user: null, internal: false, songSource: null, actingAs: null, ...overrides });

describe('어드민 대행 streamerProcedure (#71)', () => {
  it('스트리머 세션은 그대로', async () => {
    expect(await caller({ user: { id: 7, role: 'streamer' } }).whoami()).toEqual({ id: 7, role: 'streamer' });
  });
  it('admin 세션 + actingAs 면 대상 스트리머로 좁혀진다', async () => {
    expect(await caller({ user: { id: 1, role: 'admin' }, actingAs: { userId: 42, adminId: 1 } }).whoami()).toEqual({ id: 42, role: 'streamer' });
  });
  it('admin 세션이라도 actingAs 가 없으면 스트리머 API 는 막힌다', async () => {
    await expect(caller({ user: { id: 1, role: 'admin' } }).whoami()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
  it('스트리머 세션에 actingAs 가 붙어 있어도(위조) 본인 스코프 그대로', async () => {
    expect(await caller({ user: { id: 7, role: 'streamer' }, actingAs: { userId: 42, adminId: 7 } }).whoami()).toEqual({ id: 7, role: 'streamer' });
  });
  it('대행 중에도 어드민 프로시저는 실제 세션(admin)으로 판정한다', async () => {
    expect(await caller({ user: { id: 1, role: 'admin' }, actingAs: { userId: 42, adminId: 1 } }).adminOnly()).toEqual({ id: 1, role: 'admin' });
  });
  it('비로그인은 막힌다', async () => {
    await expect(caller({ actingAs: { userId: 42, adminId: 1 } }).whoami()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
