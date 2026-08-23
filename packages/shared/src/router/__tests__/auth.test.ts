import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

import { appRouter } from '..';
import type { Context } from '../../trpc';

function createCaller(overrides: Partial<Context> = {}) {
  const prisma = {
    chatbotEchoCommand: { findMany: vi.fn().mockResolvedValue([]) },
    chatbotFunctionCommand: { findMany: vi.fn().mockResolvedValue([]) },
    chatbotRepeat: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
  };
  const ctx = { prisma, user: null, internal: false, ...overrides } as unknown as Context;
  return { caller: appRouter.createCaller(ctx), prisma };
}

async function expectTrpcCode(promise: Promise<unknown>, code: TRPCError['code']) {
  await expect(promise).rejects.toBeInstanceOf(TRPCError);
  await expect(promise).rejects.toMatchObject({ code });
}

describe('publicProcedure', () => {
  it('인증 없이 호출 가능', async () => {
    const { caller } = createCaller();
    await expect(caller.ping()).resolves.toBe('pong');
    await expect(caller.user.getUsersPublic()).resolves.toEqual([]);
  });
});

describe('streamerProcedure', () => {
  it('비로그인 → UNAUTHORIZED', async () => {
    const { caller } = createCaller();
    await expectTrpcCode(caller.command.getCommandList(), 'UNAUTHORIZED');
    await expectTrpcCode(
      caller.command.createCommandEcho({ command: 'a', response: 'b' }),
      'UNAUTHORIZED',
    );
  });

  it('admin 역할로는 스트리머 API 호출 불가', async () => {
    const { caller } = createCaller({ user: { id: 1, role: 'admin' } });
    await expectTrpcCode(caller.command.getCommandList(), 'UNAUTHORIZED');
  });

  it('로그인한 스트리머는 ctx.user.id 스코프로 조회한다 (입력에 userId 없음)', async () => {
    const { caller, prisma } = createCaller({ user: { id: 42, role: 'streamer' } });
    await caller.command.getCommandList();
    expect(prisma.chatbotEchoCommand.findMany).toHaveBeenCalledWith({ where: { userId: 42 } });
    expect(prisma.chatbotFunctionCommand.findMany).toHaveBeenCalledWith({ where: { userId: 42 } });
  });
});

describe('internalProcedure', () => {
  it('내부 토큰 없이는 UNAUTHORIZED (로그인 사용자여도)', async () => {
    const { caller } = createCaller({ user: { id: 1, role: 'streamer' } });
    await expectTrpcCode(caller.chatbot.getChannels(), 'UNAUTHORIZED');
    await expectTrpcCode(caller.user.ensureAccessToken({ userId: 1 }), 'UNAUTHORIZED');
  });

  it('내부 요청이면 호출 가능', async () => {
    const { caller } = createCaller({ internal: true });
    await expect(caller.chatbot.getChannels()).resolves.toEqual([]);
  });
});

describe('ServiceError → TRPCError 매핑', () => {
  it('NOT_FOUND는 TRPC NOT_FOUND 코드와 원래 메시지를 유지한다', async () => {
    const { caller } = createCaller({ user: { id: 1, role: 'streamer' } });
    const promise = caller.command.getRepeatById({ id: 999 });
    await expectTrpcCode(promise, 'NOT_FOUND');
    await expect(promise).rejects.toMatchObject({ message: '존재하지 않는 반복 메시지입니다.' });
  });

  it('공개 명령어 조회: 없는 채널은 NOT_FOUND', async () => {
    const { caller } = createCaller();
    await expectTrpcCode(
      caller.command.getCommandListByChannelName({ channelName: 'nobody' }),
      'NOT_FOUND',
    );
  });
});
