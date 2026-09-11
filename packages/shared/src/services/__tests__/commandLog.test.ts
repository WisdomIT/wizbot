import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { COMMAND_LOG_RETENTION_DAYS, getStats, purgeExpired, recentCountsByCommand, record, statsFor } from '../commandLog';

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

describe('getStats — 통계 대시보드 (#276 2단계)', () => {
  const NOW_KST = new Date('2026-09-12T03:00:00Z'); // 한국 시간 12일 12:00
  const at = (iso: string) => new Date(iso);

  function createStatsPrisma(rows: object[], echo: object[] = [], func: object[] = []) {
    const prisma = {
      chatbotCommandLog: { findMany: vi.fn().mockResolvedValue(rows) },
      chatbotEchoCommand: { findMany: vi.fn().mockResolvedValue(echo) },
      chatbotFunctionCommand: { findMany: vi.fn().mockResolvedValue(func) },
    };
    return { prisma: prisma as unknown as PrismaClient, ...prisma };
  }

  it('순위는 현재 이름으로 합치고, 삭제된 명령어는 로그 이름 + deleted', async () => {
    const rows = [
      { command: '카페', matchedType: 'ECHO', matchedId: 1, outcome: 'OK', createdAt: at('2026-09-12T01:00:00Z') },
      { command: '옛이름', matchedType: 'ECHO', matchedId: 1, outcome: 'OK', createdAt: at('2026-09-11T01:00:00Z') },
      { command: '방제', matchedType: 'FUNCTION', matchedId: 10, outcome: 'NO_PERMISSION', createdAt: at('2026-09-12T02:00:00Z') },
      { command: '지운것', matchedType: 'ECHO', matchedId: 99, outcome: 'OK', createdAt: at('2026-09-12T02:00:00Z') },
      { command: '없는명령', matchedType: 'NONE', matchedId: null, outcome: 'NOT_FOUND', createdAt: at('2026-09-12T02:00:00Z') },
    ];
    const { prisma, chatbotCommandLog } = createStatsPrisma(rows, [{ id: 1, command: '카페새이름' }], [{ id: 10, command: '방제' }]);
    const stats = await getStats(prisma, 1, 7, NOW_KST);

    expect(stats).toMatchObject({ days: 7, total: 5, matched: 4 });
    expect(stats.ranking).toEqual([
      { type: 'ECHO', id: 1, command: '카페새이름', count: 2, deleted: false },
      { type: 'FUNCTION', id: 10, command: '방제', count: 1, deleted: false },
      { type: 'ECHO', id: 99, command: '지운것', count: 1, deleted: true },
    ]);
    expect(stats.unmatched).toEqual([
      { command: '방제', outcome: 'NO_PERMISSION', count: 1 },
      { command: '없는명령', outcome: 'NOT_FOUND', count: 1 },
    ]);
    // 7일 창: 한국 시간 9/6 자정부터
    expect(chatbotCommandLog.findMany.mock.calls[0][0].where.createdAt).toEqual({ gte: new Date('2026-09-05T15:00:00Z') });
  });

  it('일별 추이는 한국 시간 자정 버킷, 상위 5개 + 기타', async () => {
    const rows = [];
    for (let id = 1; id <= 6; id++) {
      for (let n = 0; n < id; n++) rows.push({ command: `c${id}`, matchedType: 'ECHO', matchedId: id, outcome: 'OK', createdAt: at('2026-09-12T01:00:00Z') });
    }
    //  한국 시간으로는 11일 23:30 — 11일 버킷
    rows.push({ command: 'c6', matchedType: 'ECHO', matchedId: 6, outcome: 'OK', createdAt: at('2026-09-11T14:30:00Z') });
    const { prisma } = createStatsPrisma(rows);
    const stats = await getStats(prisma, 1, 7, NOW_KST);

    expect(stats.daily.labels).toEqual(['09-06', '09-07', '09-08', '09-09', '09-10', '09-11', '09-12']);
    expect(stats.daily.series.map((line) => line.name)).toEqual(['!c6', '!c5', '!c4', '!c3', '!c2', '기타']);
    expect(stats.daily.series[0].values).toEqual([0, 0, 0, 0, 0, 1, 6]);
    expect(stats.daily.series[5]).toEqual({ name: '기타', values: [0, 0, 0, 0, 0, 0, 1] });
  });

  it('호출이 없으면 빈 순위·0 으로 채운 라벨', async () => {
    const { prisma } = createStatsPrisma([]);
    const stats = await getStats(prisma, 1, 30, NOW_KST);
    expect(stats).toMatchObject({ total: 0, matched: 0, ranking: [], unmatched: [] });
    expect(stats.daily.labels).toHaveLength(30);
    expect(stats.daily.series).toEqual([]);
  });
});
