import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/nodemailer', () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));

import { sendMail } from '../../lib/nodemailer';
import { appRouter } from '..';
import type { Context } from '../../trpc';

const APP = { id: 7, channelId: 'c'.repeat(32), channelName: '테스터', channelImageUrl: null, status: 'REJECTED', reason: null, rejectReason: null };

function createCaller(overrides: Partial<Context> = {}) {
  const prisma = {
    signupApplication: {
      findUnique: vi.fn().mockResolvedValue(APP),
      update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ ...APP, ...data })),
    },
    whitelist: { findUnique: vi.fn().mockResolvedValue(null) },
    admin: { findMany: vi.fn().mockResolvedValue([{ email: 'a@b.c' }, { email: 'd@e.f' }]) },
  };
  const ctx = { prisma, user: null, internal: false, ...overrides } as unknown as Context;
  return { caller: appRouter.createCaller(ctx), prisma };
}

describe('signup 라우터 (#96)', () => {
  it('세션 없이 → UNAUTHORIZED', async () => {
    const { caller } = createCaller();
    await expect(caller.signup.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('스트리머·관리자 세션으로는 신청자 API 를 쓸 수 없다', async () => {
    for (const role of ['streamer', 'admin'] as const) {
      const { caller } = createCaller({ user: { id: 1, role } });
      await expect(caller.signup.me()).rejects.toBeInstanceOf(TRPCError);
    }
  });

  it('신청자 세션의 id 가 곧 신청 레코드 id — 다른 신청을 볼 수 없다', async () => {
    const { caller, prisma } = createCaller({ user: { id: 7, role: 'applicant' } });
    await caller.signup.me();
    expect(prisma.signupApplication.findUnique).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('재신청이면 관리자 전원에게 메일 (실패해도 신청은 성공)', async () => {
    const { caller } = createCaller({ user: { id: 7, role: 'applicant' } });
    await expect(caller.signup.submit({ reason: '다시' })).resolves.toMatchObject({ status: 'PENDING' });
    // 알림은 fire-and-forget 이라 한 틱 기다린다
    await new Promise((resolve) => setImmediate(resolve));
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.c,d@e.f' }));
  });
});
