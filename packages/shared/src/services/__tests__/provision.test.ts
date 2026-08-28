import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTokensMock = vi.fn();
vi.mock('../chzzkClient', () => ({
  getChzzkClientForUser: vi.fn(() => ({ auth: { setTokens: setTokensMock } })),
}));

import { provisionStreamer } from '../provision';

const IDENTITY = { channelId: 'c'.repeat(32), channelName: '테스터', channelImageUrl: null };
const initialCommands = (userId: number) => ({
  initialFunction: [{ userId, permission: 'MANAGER' as const, command: '추가', function: 'createCommandEcho' }],
  initialEcho: [{ userId, command: '테스트', response: '챗봇 명령어 테스트입니다' }],
});

function createPrisma() {
  const user = { upsert: vi.fn().mockResolvedValue({ id: 42, ...IDENTITY }) };
  const userSetting = { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() };
  const chatbotFunctionCommand = { findFirst: vi.fn().mockResolvedValue(null), createMany: vi.fn() };
  const chatbotEchoCommand = { createMany: vi.fn() };
  const prisma = { user, userSetting, chatbotFunctionCommand, chatbotEchoCommand };
  return { prisma: prisma as unknown as PrismaClient, ...prisma };
}

describe('provisionStreamer — 인터락과 신청 승인이 공유하는 계정 프로비저닝 (#151)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('첫 로그인: User·UserSetting·토큰·기본 명령어를 만든다', async () => {
    const { prisma, userSetting, chatbotFunctionCommand, chatbotEchoCommand } = createPrisma();
    const tokens = { accessToken: 'at', refreshToken: 'rt', tokenType: 'Bearer', expiresIn: 1, obtainedAt: 0 };
    const user = await provisionStreamer(prisma, IDENTITY, { tokens, initialCommands });
    expect(user.id).toBe(42);
    expect(userSetting.create).toHaveBeenCalledWith({ data: { userId: 42 } });
    expect(setTokensMock).toHaveBeenCalledWith(tokens);
    expect(chatbotFunctionCommand.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ userId: 42, command: '추가' })] });
    expect(chatbotEchoCommand.createMany).toHaveBeenCalled();
  });

  it('멱등: 설정·명령어가 이미 있으면 만들지 않고, 토큰이 없으면 저장하지 않는다', async () => {
    const { prisma, userSetting, chatbotFunctionCommand } = createPrisma();
    userSetting.findFirst.mockResolvedValue({ id: 1 });
    chatbotFunctionCommand.findFirst.mockResolvedValue({ id: 1 });
    await provisionStreamer(prisma, IDENTITY, { tokens: null, initialCommands });
    expect(userSetting.create).not.toHaveBeenCalled();
    expect(chatbotFunctionCommand.createMany).not.toHaveBeenCalled();
    expect(setTokensMock).not.toHaveBeenCalled();
  });
});
