import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { agentIntroSuggestion, computeCommandSuggestions, dismiss, favoriteSongSuggestion, listCommandSuggestions } from '../suggestion';

const NOW = new Date('2026-09-12T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const old = new Date(NOW.getTime() - 40 * DAY_MS);
const fresh = new Date(NOW.getTime() - 3 * DAY_MS);

function createPrisma(options: {
  echo?: object[];
  func?: object[];
  recent?: { matchedType: string; matchedId: number; count: number }[];
  notFound?: { command: string; count: number }[];
  usageErrors?: { matchedId: number; count: number }[];
  dismissals?: object[];
} = {}) {
  const groupBy = vi.fn().mockImplementation(async ({ by, where }: { by: string[]; where: { outcome?: string; matchedId?: unknown } }) => {
    if (where.outcome === 'NOT_FOUND') return (options.notFound ?? []).map((row) => ({ command: row.command, _count: { _all: row.count } }));
    if (where.outcome === 'USAGE_ERROR') return (options.usageErrors ?? []).map((row) => ({ matchedId: row.matchedId, _count: { _all: row.count } }));
    //  recentCountsByCommand — 30일·7일 같은 값
    return by.includes('matchedType') ? (options.recent ?? []).map((row) => ({ matchedType: row.matchedType, matchedId: row.matchedId, _count: { _all: row.count } })) : [];
  });
  const prisma = {
    chatbotEchoCommand: { findMany: vi.fn().mockResolvedValue(options.echo ?? []) },
    chatbotFunctionCommand: { findMany: vi.fn().mockResolvedValue(options.func ?? []) },
    chatbotCommandLog: { groupBy },
    userSuggestionDismissal: {
      findMany: vi.fn().mockResolvedValue(options.dismissals ?? []),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma: prisma as unknown as PrismaClient, ...prisma };
}

const cmd = (id: number, command: string, extra: object = {}) => ({ id, userId: 1, command, enabled: true, totalCount: 0, createdAt: old, ...extra });

describe('computeCommandSuggestions (#276)', () => {
  it('안 쓰는 명령어 — 켜져 있고 30일 넘게 됐고 최근 30일 0회. 갓 만든 것·꺼진 것·쓰인 것은 제외', async () => {
    const { prisma } = createPrisma({
      echo: [cmd(1, '오래됨'), cmd(2, '새것', { createdAt: fresh }), cmd(3, '꺼짐', { enabled: false }), cmd(4, '쓰임')],
      func: [cmd(10, '기능')],
      recent: [{ matchedType: 'ECHO', matchedId: 4, count: 3 }],
    });
    const result = await computeCommandSuggestions(prisma, 1, NOW);
    expect(result).toEqual([
      { kind: 'UNUSED_COMMAND', key: 'echo:1', payload: { type: 'echo', id: 1, command: '오래됨' } },
      { kind: 'UNUSED_COMMAND', key: 'function:10', payload: { type: 'function', id: 10, command: '기능' } },
    ]);
  });

  it('없는 명령어는 5회 이상만, 꺼진 명령어 이름이면 켜기 제안, 켜진 이름이면 무시', async () => {
    const { prisma } = createPrisma({
      echo: [cmd(3, '꺼짐', { enabled: false, createdAt: fresh }), cmd(4, '켜짐', { createdAt: fresh })],
      notFound: [
        { command: '디스코드', count: 7 },
        { command: '한번', count: 1 },
        { command: '꺼짐', count: 5 },
        { command: '켜짐', count: 9 },
      ],
    });
    const result = await computeCommandSuggestions(prisma, 1, NOW);
    expect(result).toEqual([
      { kind: 'MISSING_COMMAND', key: '디스코드', payload: { command: '디스코드', count: 7 } },
      { kind: 'DISABLED_COMMAND', key: 'echo:3', payload: { type: 'echo', id: 3, command: '꺼짐', count: 5 } },
    ]);
  });

  it('용법 오류 5회 이상인 기능 명령어', async () => {
    const { prisma } = createPrisma({
      func: [cmd(10, '추가', { createdAt: fresh }), cmd(11, '수정', { createdAt: fresh })],
      usageErrors: [{ matchedId: 10, count: 6 }, { matchedId: 11, count: 2 }, { matchedId: 99, count: 10 }],
    });
    const result = await computeCommandSuggestions(prisma, 1, NOW);
    expect(result).toEqual([
      { kind: 'USAGE_ERROR_COMMAND', key: 'function:10', payload: { type: 'function', id: 10, command: '추가', count: 6 } },
    ]);
  });
});

describe('listCommandSuggestions — 숨김 규칙', () => {
  it('숨긴 제안은 빠지고, 조건이 해제된 숨김 기록은 지운다', async () => {
    const { prisma, userSuggestionDismissal } = createPrisma({
      echo: [cmd(1, '오래됨'), cmd(2, '역시오래됨')],
      dismissals: [
        { id: 100, userId: 1, kind: 'UNUSED_COMMAND', key: 'echo:1' },
        //  더 이상 성립하지 않는 제안(없는 명령어가 생겼거나 다시 쓰임) — 지워야 다음에 다시 뜬다
        { id: 101, userId: 1, kind: 'MISSING_COMMAND', key: '디스코드' },
      ],
    });
    const result = await listCommandSuggestions(prisma, 1, NOW);
    expect(result.map((item) => item.key)).toEqual(['echo:2']);
    expect(userSuggestionDismissal.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [101] } } });
  });

  it('dismiss 는 (userId, kind, key) 로 upsert — 키는 64자로 자른다', async () => {
    const { prisma, userSuggestionDismissal } = createPrisma();
    await expect(dismiss(prisma, 1, 'MISSING_COMMAND', 'x'.repeat(80))).resolves.toEqual({ ok: true });
    expect(userSuggestionDismissal.upsert.mock.calls[0][0].where).toEqual({ userId_kind_key: { userId: 1, kind: 'MISSING_COMMAND', key: 'x'.repeat(64) } });
  });
});

describe('4단계 — 즐겨찾기 넛지·에이전트 첫 사용 안내', () => {
  function createNudgePrisma(options: { plays?: number; conversations?: number; dismissed?: boolean } = {}) {
    const prisma = {
      songHistory: { count: vi.fn().mockResolvedValue(options.plays ?? 0) },
      agentConversation: { count: vi.fn().mockResolvedValue(options.conversations ?? 0) },
      userSuggestionDismissal: {
        findUnique: vi.fn().mockResolvedValue(options.dismissed ? { id: 1 } : null),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { prisma: prisma as unknown as PrismaClient, ...prisma };
  }

  it('곡: 최근 30일 재생 완료 3회 이상 + 대표 즐겨찾기에 없음 → 건수. 숨겼으면 null', async () => {
    const a = createNudgePrisma({ plays: 3 });
    await expect(favoriteSongSuggestion(a.prisma, 1, 'abc', false, NOW)).resolves.toEqual({ count: 3 });
    expect(a.songHistory.count).toHaveBeenCalledWith({
      where: { userId: 1, youtubeId: 'abc', status: 'PLAYED', requestedAt: { gte: new Date(NOW.getTime() - 30 * DAY_MS) } },
    });
    const b = createNudgePrisma({ plays: 3, dismissed: true });
    await expect(favoriteSongSuggestion(b.prisma, 1, 'abc', false, NOW)).resolves.toBeNull();
  });

  it('곡: 담겨 있거나 2회 이하면 null 이고 숨김 기록을 지운다 (조건 해제)', async () => {
    const a = createNudgePrisma({ plays: 10 });
    await expect(favoriteSongSuggestion(a.prisma, 1, 'abc', true, NOW)).resolves.toBeNull();
    expect(a.userSuggestionDismissal.deleteMany).toHaveBeenCalledWith({ where: { userId: 1, kind: 'FAVORITE_SONG', key: 'abc' } });
    const b = createNudgePrisma({ plays: 2 });
    await expect(favoriteSongSuggestion(b.prisma, 1, 'abc', false, NOW)).resolves.toBeNull();
    expect(b.userSuggestionDismissal.deleteMany).toHaveBeenCalled();
  });

  it('에이전트: 대화가 0건이고 안 닫았을 때만 true, 대화가 생기면 숨김 기록을 지우고 false', async () => {
    await expect(agentIntroSuggestion(createNudgePrisma().prisma, 1)).resolves.toBe(true);
    await expect(agentIntroSuggestion(createNudgePrisma({ dismissed: true }).prisma, 1)).resolves.toBe(false);
    const c = createNudgePrisma({ conversations: 2, dismissed: true });
    await expect(agentIntroSuggestion(c.prisma, 1)).resolves.toBe(false);
    expect(c.userSuggestionDismissal.deleteMany).toHaveBeenCalledWith({ where: { userId: 1, kind: 'AGENT_INTRO', key: 'intro' } });
  });
});
