import type { PrismaClient, SuggestionKind } from '@prisma/client';

import { listCommands } from './command';
import { recentCountsByCommand, statsFor } from './commandLog';

/**
 * 사용 패턴 기반 제안 (#276 3단계). 강제성 없는 넛지 — 모든 제안은 숨길 수 있고,
 * 한 번 숨긴 제안은 조건이 해제되기 전까지 다시 뜨지 않는다. 조건이 해제되면 숨김 기록을 지워
 * 다음에 다시 성립하면 새 제안으로 뜬다. 임계값은 상수로만 두고 설정 UI 는 만들지 않는다.
 */

export const SUGGEST_WINDOW_DAYS = 30;
/** 만든 지 이만큼 지난 명령어만 「안 쓰임」 판정 — 갓 만든 명령어는 제외 */
export const UNUSED_MIN_AGE_DAYS = 30;
export const MISSING_MIN_CALLS = 5;
export const USAGE_ERROR_MIN_CALLS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

type CommandType = 'echo' | 'function';
export const commandKey = (type: CommandType, id: number) => `${type}:${id}`;

export type CommandSuggestion =
  | { kind: 'UNUSED_COMMAND'; key: string; payload: { type: CommandType; id: number; command: string } }
  | { kind: 'DISABLED_COMMAND'; key: string; payload: { type: CommandType; id: number; command: string; count: number } }
  | { kind: 'MISSING_COMMAND'; key: string; payload: { command: string; count: number } }
  | { kind: 'USAGE_ERROR_COMMAND'; key: string; payload: { type: 'function'; id: number; command: string; count: number } };

/** 이 서비스가 계산하는 종류 — 숨김 해제 판정도 여기까지만 (곡·에이전트 안내는 각자) */
export const COMMAND_SUGGESTION_KINDS: SuggestionKind[] = ['UNUSED_COMMAND', 'DISABLED_COMMAND', 'MISSING_COMMAND', 'USAGE_ERROR_COMMAND'];

/** 조건에 맞는 제안 전부 — 숨김은 아직 적용하지 않은 상태 */
export async function computeCommandSuggestions(prisma: PrismaClient, userId: number, now = new Date()): Promise<CommandSuggestion[]> {
  const since = new Date(now.getTime() - SUGGEST_WINDOW_DAYS * DAY_MS);
  const minCreated = new Date(now.getTime() - UNUSED_MIN_AGE_DAYS * DAY_MS);
  const [list, recent, notFound, usageErrors] = await Promise.all([
    listCommands(prisma, userId),
    recentCountsByCommand(prisma, userId, now),
    prisma.chatbotCommandLog.groupBy({
      by: ['command'],
      where: { userId, outcome: 'NOT_FOUND', createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.chatbotCommandLog.groupBy({
      by: ['matchedId'],
      where: { userId, outcome: 'USAGE_ERROR', matchedType: 'FUNCTION', matchedId: { not: null }, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const commands = [
    ...list.echo.map((row) => ({ type: 'echo' as const, id: row.id, command: row.command, enabled: row.enabled, createdAt: row.createdAt, totalCount: row.totalCount })),
    ...list.function.map((row) => ({ type: 'function' as const, id: row.id, command: row.command, enabled: row.enabled, createdAt: row.createdAt, totalCount: row.totalCount })),
  ];
  const byName = new Map(commands.map((row) => [row.command, row]));
  const suggestions: CommandSuggestion[] = [];

  //  4. 오래 안 쓰인 명령어 — 켜져 있고, 만든 지 30일 지났고, 최근 30일 호출 0
  for (const row of commands) {
    if (!row.enabled || row.createdAt > minCreated) continue;
    const stats = statsFor(recent, row.type === 'echo' ? 'ECHO' : 'FUNCTION', row.id, row.totalCount);
    if (stats.d30 > 0) continue;
    suggestions.push({ kind: 'UNUSED_COMMAND', key: commandKey(row.type, row.id), payload: { type: row.type, id: row.id, command: row.command } });
  }

  //  3. 없는·꺼진 명령어를 반복 호출 — 켜진 명령어 이름이면 일시적 불일치라 제안하지 않는다
  for (const group of notFound) {
    if (group._count._all < MISSING_MIN_CALLS) continue;
    const existing = byName.get(group.command);
    if (existing && existing.enabled) continue;
    if (existing) {
      suggestions.push({
        kind: 'DISABLED_COMMAND',
        key: commandKey(existing.type, existing.id),
        payload: { type: existing.type, id: existing.id, command: existing.command, count: group._count._all },
      });
    } else {
      suggestions.push({ kind: 'MISSING_COMMAND', key: group.command, payload: { command: group.command, count: group._count._all } });
    }
  }

  //  3'. 용법 오류가 잦은 기능 명령어
  for (const group of usageErrors) {
    if (group.matchedId === null || group._count._all < USAGE_ERROR_MIN_CALLS) continue;
    const existing = list.function.find((row) => row.id === group.matchedId);
    if (!existing) continue;
    suggestions.push({
      kind: 'USAGE_ERROR_COMMAND',
      key: commandKey('function', existing.id),
      payload: { type: 'function', id: existing.id, command: existing.command, count: group._count._all },
    });
  }

  return suggestions;
}

/**
 * 화면·에이전트가 보는 제안 목록 — 숨긴 것은 빼고, 조건이 해제된 숨김 기록은 지운다(다음에 다시 성립하면 새 제안).
 */
export async function listCommandSuggestions(prisma: PrismaClient, userId: number, now = new Date()): Promise<CommandSuggestion[]> {
  const [computed, dismissals] = await Promise.all([
    computeCommandSuggestions(prisma, userId, now),
    prisma.userSuggestionDismissal.findMany({ where: { userId, kind: { in: COMMAND_SUGGESTION_KINDS } } }),
  ]);
  const active = new Set(computed.map((item) => `${item.kind}:${item.key}`));
  const stale = dismissals.filter((row) => !active.has(`${row.kind}:${row.key}`));
  if (stale.length > 0) {
    await prisma.userSuggestionDismissal.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  }
  const dismissed = new Set(dismissals.filter((row) => active.has(`${row.kind}:${row.key}`)).map((row) => `${row.kind}:${row.key}`));
  return computed.filter((item) => !dismissed.has(`${item.kind}:${item.key}`));
}

/** 숨기기 — 같은 (kind, key) 는 한 번만 기록된다 */
export async function dismiss(prisma: PrismaClient, userId: number, kind: SuggestionKind, key: string) {
  const trimmed = key.trim().slice(0, 64);
  await prisma.userSuggestionDismissal.upsert({
    where: { userId_kind_key: { userId, kind, key: trimmed } },
    update: { dismissedAt: new Date() },
    create: { userId, kind, key: trimmed },
  });
  return { ok: true as const };
}

/* ── 4단계: 자주 들은 곡 → 즐겨찾기, 에이전트 첫 사용 안내 ── */

export const FAVORITE_SONG_MIN_PLAYS = 3;
export const AGENT_INTRO_KEY = 'intro';

/**
 * 지금 재생 중인 곡을 대표 즐겨찾기에 담으라는 넛지 (#276 6).
 * 최근 30일 재생 완료 N회 이상이고 대표 즐겨찾기에 없을 때만. 담기면 조건이 풀려 숨김 기록도 지운다.
 */
export async function favoriteSongSuggestion(
  prisma: PrismaClient,
  userId: number,
  youtubeId: string,
  inDefaultFavorite: boolean,
  now = new Date(),
): Promise<{ count: number } | null> {
  const where = { userId_kind_key: { userId, kind: 'FAVORITE_SONG' as const, key: youtubeId } };
  const release = () => prisma.userSuggestionDismissal.deleteMany({ where: { userId, kind: 'FAVORITE_SONG', key: youtubeId } });
  if (inDefaultFavorite) {
    await release();
    return null;
  }
  const count = await prisma.songHistory.count({
    where: { userId, youtubeId, status: 'PLAYED', requestedAt: { gte: new Date(now.getTime() - SUGGEST_WINDOW_DAYS * DAY_MS) } },
  });
  if (count < FAVORITE_SONG_MIN_PLAYS) {
    await release();
    return null;
  }
  const dismissed = await prisma.userSuggestionDismissal.findUnique({ where });
  return dismissed ? null : { count };
}

/**
 * 에이전트를 한 번도 열어보지 않은 스트리머에게 열기 버튼 옆 안내 (#276 7).
 * 대화가 하나라도 생기면(soft delete 포함) 조건이 풀려 다시 뜨지 않는다.
 */
export async function agentIntroSuggestion(prisma: PrismaClient, userId: number): Promise<boolean> {
  const conversations = await prisma.agentConversation.count({ where: { userId } });
  if (conversations > 0) {
    await prisma.userSuggestionDismissal.deleteMany({ where: { userId, kind: 'AGENT_INTRO', key: AGENT_INTRO_KEY } });
    return false;
  }
  const dismissed = await prisma.userSuggestionDismissal.findUnique({
    where: { userId_kind_key: { userId, kind: 'AGENT_INTRO', key: AGENT_INTRO_KEY } },
  });
  return !dismissed;
}
