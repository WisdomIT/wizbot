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

/* ── 통계 (#276 2단계) ── */

/** 집계 경계는 한국 시간 자정 — 사용자가 보는 "오늘"과 같은 자정을 본다 (agent 서비스와 같은 규칙) */
const KST = 'Asia/Seoul';
function kstDayKey(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: KST });
}
function kstStartOfDay(now: Date, daysAgo: number): Date {
  const key = kstDayKey(new Date(now.getTime() - daysAgo * DAY_MS));
  return new Date(`${key}T00:00:00+09:00`);
}

export type StatsWindow = 7 | 30;
/** 순위·추이 시리즈에 이름을 붙이는 상위 개수 — 나머지는 「기타」 */
export const STATS_TOP = 10;
export const STATS_SERIES = 5;
export const STATS_UNMATCHED_TOP = 20;

export interface CommandStatsReport {
  days: StatsWindow;
  /** 기간 내 전체 호출(미매칭 포함)·매칭 호출 */
  total: number;
  matched: number;
  /** 명령어별 호출 수, 많은 순 (전부 — 화면이 상위 N 만 보이고 나머지는 「기타」로 접는다) */
  ranking: { type: 'ECHO' | 'FUNCTION'; id: number; command: string; count: number; deleted: boolean }[];
  /** 일별 추이 — 한국 시간 자정 버킷. 상위 STATS_SERIES 개 + 「기타」 */
  daily: { labels: string[]; series: { name: string; values: number[] }[] };
  /** 없는·꺼진 명령어, 용법 오류, 권한 없음 — 이름별, 많은 순 */
  unmatched: { command: string; outcome: 'NOT_FOUND' | 'USAGE_ERROR' | 'NO_PERMISSION'; count: number }[];
}

export async function getStats(prisma: PrismaClient, userId: number, days: StatsWindow, now = new Date()): Promise<CommandStatsReport> {
  const start = kstStartOfDay(now, days - 1);
  const [rows, echo, func] = await Promise.all([
    prisma.chatbotCommandLog.findMany({
      where: { userId, createdAt: { gte: start } },
      select: { command: true, matchedType: true, matchedId: true, outcome: true, createdAt: true },
    }),
    prisma.chatbotEchoCommand.findMany({ where: { userId }, select: { id: true, command: true } }),
    prisma.chatbotFunctionCommand.findMany({ where: { userId }, select: { id: true, command: true } }),
  ]);
  //  현재 이름을 우선한다 — 이름을 바꿔도 같은 명령어(id)로 합쳐 보인다. 삭제됐으면 로그의 이름
  const currentName = new Map<string, string>([
    ...echo.map((row) => [`ECHO:${row.id}`, row.command] as const),
    ...func.map((row) => [`FUNCTION:${row.id}`, row.command] as const),
  ]);

  const labels: string[] = [];
  const dayIndex = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const key = kstDayKey(new Date(start.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000));
    dayIndex.set(key, i);
    labels.push(key.slice(5));
  }

  const perCommand = new Map<string, { type: 'ECHO' | 'FUNCTION'; id: number; name: string; count: number; daily: number[] }>();
  const unmatchedCount = new Map<string, { command: string; outcome: 'NOT_FOUND' | 'USAGE_ERROR' | 'NO_PERMISSION'; count: number }>();
  let matched = 0;
  for (const row of rows) {
    if (row.matchedId !== null && row.matchedType !== 'NONE') {
      matched++;
      const key = `${row.matchedType}:${row.matchedId}`;
      const entry = perCommand.get(key) ?? {
        type: row.matchedType,
        id: row.matchedId,
        name: currentName.get(key) ?? row.command,
        count: 0,
        daily: new Array<number>(days).fill(0),
      };
      entry.count++;
      const day = dayIndex.get(kstDayKey(row.createdAt));
      if (day !== undefined) entry.daily[day]++;
      perCommand.set(key, entry);
    }
    if (row.outcome === 'NOT_FOUND' || row.outcome === 'USAGE_ERROR' || row.outcome === 'NO_PERMISSION') {
      const key = `${row.outcome}:${row.command}`;
      const entry = unmatchedCount.get(key) ?? { command: row.command, outcome: row.outcome, count: 0 };
      entry.count++;
      unmatchedCount.set(key, entry);
    }
  }

  const ranked = [...perCommand.entries()].sort((a, b) => b[1].count - a[1].count);
  const ranking = ranked.map(([key, entry]) => ({
    type: entry.type,
    id: entry.id,
    command: entry.name,
    count: entry.count,
    deleted: !currentName.has(key),
  }));

  const top = ranked.slice(0, STATS_SERIES);
  const rest = ranked.slice(STATS_SERIES);
  const series = top.map(([, entry]) => ({ name: `!${entry.name}`, values: entry.daily }));
  if (rest.length > 0) {
    const etc = new Array<number>(days).fill(0);
    for (const [, entry] of rest) entry.daily.forEach((value, i) => (etc[i] += value));
    series.push({ name: '기타', values: etc });
  }

  const unmatched = [...unmatchedCount.values()].sort((a, b) => b.count - a.count).slice(0, STATS_UNMATCHED_TOP);

  return { days, total: rows.length, matched, ranking, daily: { labels, series }, unmatched };
}
