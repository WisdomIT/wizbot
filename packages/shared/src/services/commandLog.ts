import type { CommandLogMatch, CommandLogOutcome, PrismaClient } from '@prisma/client';

/**
 * 명령어 호출 로그 (#276) — 채팅 응답 경로에 있으므로 기록은 최선 노력이다. 실패해도 응답을 막지 않는다.
 * 로그 행은 90일만 남기고(retention), 총 호출 수는 명령어 행의 totalCount 에 누적한다.
 */

/** 호출 로그 보존 기간 (일) */
export const COMMAND_LOG_RETENTION_DAYS = 90;
/** 시청자 입력이 그대로 들어오는 이름 컬럼 폭 */
const COMMAND_MAX = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CommandLogEntry {
  userId: number;
  command: string;
  matchedType: CommandLogMatch;
  matchedId: number | null;
  outcome: CommandLogOutcome;
  senderChannelId?: string | null;
}

export async function record(prisma: PrismaClient, entry: CommandLogEntry) {
  try {
    await prisma.chatbotCommandLog.create({
      data: {
        userId: entry.userId,
        command: entry.command.slice(0, COMMAND_MAX),
        matchedType: entry.matchedType,
        matchedId: entry.matchedId,
        outcome: entry.outcome,
        senderChannelId: entry.senderChannelId ?? null,
      },
    });
    //  매칭된 명령어는 결과와 무관하게 「호출된 것」 — 총합에 더한다
    if (entry.matchedId !== null && entry.matchedType === 'ECHO') {
      await prisma.chatbotEchoCommand.update({ where: { id: entry.matchedId }, data: { totalCount: { increment: 1 } } });
    } else if (entry.matchedId !== null && entry.matchedType === 'FUNCTION') {
      await prisma.chatbotFunctionCommand.update({ where: { id: entry.matchedId }, data: { totalCount: { increment: 1 } } });
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[command-log] 기록 실패:', entry.userId, entry.command, error);
  }
}

export interface CommandStats {
  total: number;
  d30: number;
  d7: number;
}

const keyOf = (type: CommandLogMatch, id: number) => `${type}:${id}`;

/**
 * 명령어별 최근 30일·7일 호출 수 (#276). 총합은 호출자가 명령어 행의 totalCount 로 채운다.
 * @returns `ECHO:id` / `FUNCTION:id` → { d30, d7 }
 */
export async function recentCountsByCommand(prisma: PrismaClient, userId: number, now = new Date()) {
  const countSince = async (days: number) =>
    prisma.chatbotCommandLog.groupBy({
      by: ['matchedType', 'matchedId'],
      where: { userId, matchedId: { not: null }, createdAt: { gte: new Date(now.getTime() - days * DAY_MS) } },
      _count: { _all: true },
    });
  const [rows30, rows7] = await Promise.all([countSince(30), countSince(7)]);
  const result = new Map<string, { d30: number; d7: number }>();
  for (const row of rows30) {
    if (row.matchedId === null) continue;
    result.set(keyOf(row.matchedType, row.matchedId), { d30: row._count._all, d7: 0 });
  }
  for (const row of rows7) {
    if (row.matchedId === null) continue;
    const key = keyOf(row.matchedType, row.matchedId);
    result.set(key, { d30: result.get(key)?.d30 ?? 0, d7: row._count._all });
  }
  return result;
}

export function statsFor(
  recent: Map<string, { d30: number; d7: number }>,
  type: CommandLogMatch,
  id: number,
  totalCount: number,
): CommandStats {
  const counts = recent.get(keyOf(type, id));
  return { total: totalCount, d30: counts?.d30 ?? 0, d7: counts?.d7 ?? 0 };
}

/** 보존 기간 지난 로그 삭제 — retention.purgeExpired 가 부른다 */
export async function purgeExpired(prisma: PrismaClient, now = new Date()) {
  const { count } = await prisma.chatbotCommandLog.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - COMMAND_LOG_RETENTION_DAYS * DAY_MS) } },
  });
  return count;
}
