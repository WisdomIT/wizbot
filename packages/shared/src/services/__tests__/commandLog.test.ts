import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { COMMAND_LOG_RETENTION_DAYS, purgeExpired, recentCountsByCommand, record, statsFor } from '../commandLog';

const NOW = new Date('2026-09-12T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function createPrisma() {
  const chatbotCommandLog = {
    create: vi.fn().mockResolvedValue({}),
    groupBy: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
  };
  const chatbotEchoCommand = { update: vi.fn().mockResolvedValue({}) };
  const chatbotFunctionCommand = { update: vi.fn().mockResolvedValue({}) };
  const prisma = { chatbotCommandLog, chatbotEchoCommand, chatbotFunctionCommand };
  return { prisma: prisma as unknown as PrismaClient, ...prisma };
}

describe('commandLog (#276)', () => {
  it('매칭된 echo 호출 — 로그 행 + 명령어 totalCount 증가', async () => {
    const { prisma, chatbotCommandLog, chatbotEchoCommand } = createPrisma();
    await record(prisma, { userId: 1, command: '카페', matchedType: 'ECHO', matchedId: 5, outcome: 'OK', senderChannelId: 'abc' });
    expect(chatbotCommandLog.create).toHaveBeenCalledWith({
      data: { userId: 1, command: '카페', matchedType: 'ECHO', matchedId: 5, outcome: 'OK', senderChannelId: 'abc' },
    });
    expect(chatbotEchoCommand.update).toHaveBeenCalledWith({ where: { id: 5 }, data: { totalCount: { increment: 1 } } });
  });

  it('권한 거절·용법 오류도 그 명령어를 부른 것 — 기능 명령어 totalCount 증가', async () => {
    const { prisma, chatbotFunctionCommand } = createPrisma();
    await record(prisma, { userId: 1, command: '방제 수정', matchedType: 'FUNCTION', matchedId: 10, outcome: 'NO_PERMISSION' });
    await record(prisma, { userId: 1, command: '추가', matchedType: 'FUNCTION', matchedId: 11, outcome: 'USAGE_ERROR' });
    expect(chatbotFunctionCommand.update).toHaveBeenCalledTimes(2);
  });

  it('미매칭은 로그만 남기고 카운터는 없다 — 이름은 40자로 자른다', async () => {
    const { prisma, chatbotCommandLog, chatbotEchoCommand, chatbotFunctionCommand } = createPrisma();
    await record(prisma, { userId: 1, command: 'x'.repeat(60), matchedType: 'NONE', matchedId: null, outcome: 'NOT_FOUND' });
    expect(chatbotCommandLog.create.mock.calls[0][0].data).toMatchObject({ command: 'x'.repeat(40), matchedId: null, senderChannelId: null });
    expect(chatbotEchoCommand.update).not.toHaveBeenCalled();
    expect(chatbotFunctionCommand.update).not.toHaveBeenCalled();
  });

  it('기록 실패는 삼킨다 — 채팅 응답을 막지 않는다', async () => {
    const { prisma, chatbotCommandLog } = createPrisma();
    chatbotCommandLog.create.mockRejectedValue(new Error('db down'));
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(record(prisma, { userId: 1, command: '카페', matchedType: 'ECHO', matchedId: 5, outcome: 'OK' })).resolves.toBeUndefined();
    silence.mockRestore();
  });

  it('최근 30일·7일 집계를 명령어 키로 합친다', async () => {
    const { prisma, chatbotCommandLog } = createPrisma();
    chatbotCommandLog.groupBy
      .mockResolvedValueOnce([
        { matchedType: 'ECHO', matchedId: 5, _count: { _all: 30 } },
        { matchedType: 'FUNCTION', matchedId: 10, _count: { _all: 8 } },
      ])
      .mockResolvedValueOnce([{ matchedType: 'ECHO', matchedId: 5, _count: { _all: 7 } }]);
    const recent = await recentCountsByCommand(prisma, 1, NOW);
    expect(statsFor(recent, 'ECHO', 5, 120)).toEqual({ total: 120, d30: 30, d7: 7 });
    expect(statsFor(recent, 'FUNCTION', 10, 8)).toEqual({ total: 8, d30: 8, d7: 0 });
    expect(statsFor(recent, 'ECHO', 99, 0)).toEqual({ total: 0, d30: 0, d7: 0 });
    expect(chatbotCommandLog.groupBy.mock.calls[0][0].where.createdAt).toEqual({ gte: new Date(NOW.getTime() - 30 * DAY_MS) });
    expect(chatbotCommandLog.groupBy.mock.calls[1][0].where.createdAt).toEqual({ gte: new Date(NOW.getTime() - 7 * DAY_MS) });
  });

  it('90일 지난 로그를 지운다', async () => {
    const { prisma, chatbotCommandLog } = createPrisma();
    await expect(purgeExpired(prisma, NOW)).resolves.toBe(4);
    expect(chatbotCommandLog.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(NOW.getTime() - COMMAND_LOG_RETENTION_DAYS * DAY_MS) } },
    });
  });
});
