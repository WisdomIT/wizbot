import { EventEmitter } from 'node:events';

/**
 * 노래 재생 실시간 이벤트 허브 (#5 2단계).
 *
 * ⚠️ **프로세스 인메모리**다. API_REPLICAS=1 전제이며(현재 운영값), 확장 시
 *    Redis pub/sub 으로 교체한다 — 그때 이 모듈의 publish/subscribe 만 갈아끼우면 된다.
 */

export type SongEvent =
  /** 재생 상태가 바뀜 (컨트롤러·시청자·소스 모두 구독) */
  | { type: 'playback' }
  /** 대기열이 바뀜 */
  | { type: 'queue' }
  /** 컨트롤러 → 송출 소스 명령 */
  | {
      type: 'command';
      action: 'play' | 'pause' | 'stop' | 'next' | 'seek' | 'volume';
      value?: number;
    }
  /** 송출 소스 연결 상태가 바뀜 */
  | { type: 'source' };

const emitter = new EventEmitter();
// 채널마다 컨트롤러·소스·시청자가 붙으므로 기본 상한(10)으로는 부족하다
emitter.setMaxListeners(0);

function channel(userId: number) {
  return `song:${userId}`;
}

export function publishSongEvent(userId: number, event: SongEvent) {
  emitter.emit(channel(userId), event);
}

/** 구독 해제 함수를 돌려준다 */
export function subscribeSongEvents(userId: number, listener: (event: SongEvent) => void) {
  emitter.on(channel(userId), listener);
  return () => emitter.off(channel(userId), listener);
}

/* ── 송출 소스 하트비트 (오프라인 감지·중복 방지) ── */

export interface SourcePresence {
  /** 'OBS' | 'ELECTRON' */
  source: string;
  /** 창을 여러 개 열었을 때 하나만 활성으로 삼는다 */
  sessionId: string;
  lastSeenAt: number;
}

/**
 * 하트비트가 이 시간 이상 끊기면 오프라인으로 본다.
 * 송출 소스는 5초마다 보내므로 3번 연속 놓쳐야 끊긴 것으로 판정한다
 * (한 번쯤 늦는다고 「연결 안 됨」이 깜빡이지 않게).
 */
export const SOURCE_TIMEOUT_MS = 15_000;

/**
 * 스트리머당 붙어 있는 송출 세션 전부 (#319). 활성은 하나, 나머지는 대기.
 * 이전엔 활성 하나만 기억해 창이 몇 개 열려 있는지 아무도 몰랐다 — 컨트롤러가 「플레이어 2개 연결, 1개 대기」를 알리려면 목록이 필요하다.
 * releasedSessionId = 「다른 창으로 넘기기」로 주인을 내려놓은 세션. 다른 세션이 잡기 전까지는 다시 주인이 되지 않는다(다른 세션이 없으면 타임아웃 뒤 복귀)
 */
interface SourceRoom {
  activeSessionId: string | null;
  releasedSessionId: string | null;
  sessions: Map<string, SourcePresence>;
}

const rooms = new Map<number, SourceRoom>();

function room(userId: number): SourceRoom {
  let r = rooms.get(userId);
  if (!r) {
    r = { activeSessionId: null, releasedSessionId: null, sessions: new Map() };
    rooms.set(userId, r);
  }
  return r;
}

/** 타임아웃 지난 세션을 치우고, 주인이 사라졌으면 가장 최근에 본 대기 세션에게 넘긴다 */
function prune(r: SourceRoom, now: number): boolean {
  for (const [id, p] of r.sessions) {
    if (now - p.lastSeenAt > SOURCE_TIMEOUT_MS) r.sessions.delete(id);
  }
  if (r.activeSessionId && r.sessions.has(r.activeSessionId)) return false;
  const previous = r.activeSessionId;
  r.activeSessionId = null;
  let best: SourcePresence | null = null;
  for (const p of r.sessions.values()) {
    if (p.sessionId === r.releasedSessionId) continue;
    if (!best || p.lastSeenAt > best.lastSeenAt) best = p;
  }
  //  내려놓은 세션밖에 없으면 그 세션이 다시 잡는다 — 아무도 재생하지 않는 것보다 낫다
  if (!best && r.releasedSessionId && r.sessions.has(r.releasedSessionId)) best = r.sessions.get(r.releasedSessionId)!;
  if (best) {
    r.activeSessionId = best.sessionId;
    r.releasedSessionId = null;
  }
  return r.activeSessionId !== previous;
}

/**
 * 하트비트 수신.
 *
 * **먼저 잡은 세션이 유지된다.** 이전에는 하트비트마다 세션을 덮어써서, 두 기기가
 * 동시에 켜져 있으면 5초마다 주인이 뒤바뀌었다. 각 창은 자기 차례가 아니면 재생을
 * 멈추므로 어느 쪽도 제대로 재생하지 못했다.
 *
 * 주인이 하트비트를 멈추면 SOURCE_TIMEOUT_MS 뒤에 자리가 비고, 그때 대기 세션이 잡는다.
 *
 * changed 는 주인이 바뀌었거나 세션 수가 달라진 경우에만 true — 매번 이벤트를 쏘면 구독자 전원이 5초마다
 * 전체 상태를 다시 읽게 된다.
 */
export function touchSource(
  userId: number,
  source: string,
  sessionId: string,
  now = Date.now(),
): { changed: boolean; active: boolean } {
  const r = room(userId);
  const before = { active: r.activeSessionId, count: r.sessions.size, source: r.sessions.get(sessionId)?.source };
  r.sessions.set(sessionId, { source, sessionId, lastSeenAt: now });
  prune(r, now);
  const active = r.activeSessionId === sessionId;
  const changed = before.active !== r.activeSessionId || before.count !== r.sessions.size || (before.source !== undefined && before.source !== source);
  return { changed, active };
}

/** 활성 세션 — 없거나 타임아웃이면 null */
export function getSourcePresence(userId: number, now = Date.now()): SourcePresence | null {
  const r = rooms.get(userId);
  if (!r) return null;
  prune(r, now);
  return r.activeSessionId ? (r.sessions.get(r.activeSessionId) ?? null) : null;
}

/** 붙어 있는 세션 전부 (활성 먼저, 그다음 최근 순) — 컨트롤러의 다중 플레이어 안내용 (#319) */
export function listSourceSessions(userId: number, now = Date.now()): (SourcePresence & { active: boolean })[] {
  const r = rooms.get(userId);
  if (!r) return [];
  prune(r, now);
  return [...r.sessions.values()]
    .map((p) => ({ ...p, active: p.sessionId === r.activeSessionId }))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.lastSeenAt - a.lastSeenAt);
}

/** 이 세션이 현재 활성 세션인지 — 중복 실행된 창은 재생하지 않는다 */
export function isActiveSession(userId: number, sessionId: string): boolean {
  return getSourcePresence(userId)?.sessionId === sessionId;
}

/**
 * 「다른 창으로 넘기기」 (#319) — 주인을 내려놓고 대기 세션 중 가장 최근에 본 창에게 바로 넘긴다.
 * 대기 세션이 없으면 false (넘길 곳이 없다). 내려놓은 세션은 다른 세션이 붙기 전까지 다시 주인이 되지 않는다
 */
export function releaseSource(userId: number, now = Date.now()): boolean {
  const r = rooms.get(userId);
  if (!r?.activeSessionId) return false;
  prune(r, now);
  const others = [...r.sessions.values()].filter((p) => p.sessionId !== r.activeSessionId);
  if (others.length === 0) return false;
  r.releasedSessionId = r.activeSessionId;
  r.activeSessionId = null;
  prune(r, now);
  return true;
}

export function clearSource(userId: number) {
  rooms.delete(userId);
}
