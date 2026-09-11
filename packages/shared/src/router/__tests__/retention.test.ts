import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../../trpc';
import { appRouter } from '..';

function createCaller(overrides: Partial<Context> = {}) {
  const prisma = {
    agentConversation: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    chatbotCommandLog: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
  };
  const ctx = { prisma, user: null, internal: false, ...overrides } as unknown as Context;
  return { caller: appRouter.createCaller(ctx), prisma };
}

describe('retention.purgeExpired (#255)', () => {
  it('내부 서비스(워커)만 — 어드민·스트리머·비로그인은 UNAUTHORIZED', async () => {
    await expect(createCaller().caller.retention.purgeExpired()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(createCaller({ user: { id: 1, role: 'admin' } }).caller.retention.purgeExpired()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(createCaller({ user: { id: 7, role: 'streamer' } }).caller.retention.purgeExpired()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('워커 호출은 파기 건수를 돌려준다', async () => {
    const { caller, prisma } = createCaller({ internal: true });
    await expect(caller.retention.purgeExpired()).resolves.toEqual({ agentConversations: 1, accessLogs: 2, commandLogs: 3 });
    expect(prisma.agentConversation.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledTimes(1);
  });
});
