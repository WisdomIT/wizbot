import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../../trpc';
import { appRouter } from '..';

function createCaller(overrides: Partial<Context> = {}) {
  const prisma = {
    chatbotEchoCommand: { findMany: vi.fn().mockResolvedValue([]) },
    chatbotFunctionCommand: { findMany: vi.fn().mockResolvedValue([]) },
    chatbotCommandLog: { groupBy: vi.fn().mockResolvedValue([]) },
    userSuggestionDismissal: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const ctx = { prisma, user: null, internal: false, ...overrides } as unknown as Context;
  return { caller: appRouter.createCaller(ctx), prisma };
}

describe('suggestion 라우터 (#276)', () => {
  it('스트리머만 — 비로그인·어드민은 UNAUTHORIZED', async () => {
    await expect(createCaller().caller.suggestion.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(createCaller({ user: { id: 1, role: 'admin' } }).caller.suggestion.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('list 는 본인 스코프, dismiss 는 본인 userId 로 기록', async () => {
    const { caller, prisma } = createCaller({ user: { id: 7, role: 'streamer' } });
    await expect(caller.suggestion.list()).resolves.toEqual([]);
    expect(prisma.chatbotEchoCommand.findMany).toHaveBeenCalledWith({ where: { userId: 7 } });
    await caller.suggestion.dismiss({ kind: 'UNUSED_COMMAND', key: 'echo:1' });
    expect(prisma.userSuggestionDismissal.upsert.mock.calls[0][0].create).toEqual({ userId: 7, kind: 'UNUSED_COMMAND', key: 'echo:1' });
  });
});
