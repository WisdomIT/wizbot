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
  /** 송출 소스 연결 상태·선택이 바뀜 */
  | { type: 'source' }
  /** 컨트롤러의 「찾기」 (#322) — 이 세션 ID 를 가진 창이 자신을 드러낸다 */
  | { type: 'locate'; sessionId: string };

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

/* ── 송출 세션 프레즌스 (#322) ── */

export interface SourcePresence {
  /** 'OBS' | 'ELECTRON' */
  source: string;
  /** 창이 스스로 만들어 컴퓨터를 껐다 켜도 유지하는 고유 ID — 앱은 userData, OBS 페이지는 localStorage */
  sessionId: string;
  /** 앱은 컴퓨터 이름, OBS 는 「OBS 브라우저 소스」 */
  label: string;
  lastSeenAt: number;
  /** 이번에 붙은 시각 — 목록 순서를 고정하는 기준(먼저 연결된 것이 위). 타임아웃 뒤 다시 붙으면 새로 찍힌다 */
  firstSeenAt: number;
}

/**
 * 하트비트가 이 시간 이상 끊기면 오프라인으로 본다.
 * 송출 소스는 5초마다 보내므로 3번 연속 놓쳐야 끊긴 것으로 판정한다
 * (한 번쯤 늦는다고 「연결 안 됨」이 깜빡이지 않게).
 */
export const SOURCE_TIMEOUT_MS = 15_000;
/**
 * 신호가 끊긴 세션도 이만큼은 목록에 남긴다 (#322 후속) — 꺼진 앱·닫힌 OBS 를 사용자가 목록에서 알아보고(「신호 없음 · N분 전」)
 * 다시 켜질 것을 기대해 미리 송출 소스로 골라둘 수 있게. 그 뒤엔 지운다 (API 재시작이면 어차피 비운다)
 */
export const SESSION_RETENTION_MS = 60 * 60 * 1000;

/** 지금 붙어 있는가 — 마지막 하트비트가 타임아웃 안 */
export function isConnected(p: { lastSeenAt: number }, now = Date.now()): boolean {
  return now - p.lastSeenAt <= SOURCE_TIMEOUT_MS;
}

/**
 * 스트리머당 붙어 있는 송출 세션 전부. 어느 세션이 소리를 내는지는 여기서 정하지 않는다 —
 * 스트리머가 고른 세션(UserSetting.songSourceSessionId)이 주인이고, 이 목록은 「지금 누가 켜져 있나」만 안다 (#322).
 * 예전(#85·#319)엔 먼저 하트비트를 보낸 세션이 주인이 되는 규칙이 여기 있었는데, 어느 창이 소리를 내는지 사용자가 고를 수 없어 걷어냈다
 */
const rooms = new Map<number, Map<string, SourcePresence>>();

function prune(sessions: Map<string, SourcePresence>, now: number) {
  for (const [id, p] of sessions) {
    if (now - p.lastSeenAt > SESSION_RETENTION_MS) sessions.delete(id);
  }
}

/**
 * 하트비트 수신. changed = 세션이 새로 붙었거나(끊겼다 복귀 포함) 이름·종류가 바뀌었거나 목록이 달라진 경우 —
 * 매번 이벤트를 쏘면 구독자 전원이 5초마다 전체 상태를 다시 읽으므로 그때만 true
 */
export function touchSource(userId: number, presence: Omit<SourcePresence, 'lastSeenAt' | 'firstSeenAt'>, now = Date.now()): { changed: boolean } {
  let sessions = rooms.get(userId);
  if (!sessions) {
    sessions = new Map();
    rooms.set(userId, sessions);
  }
  const before = sessions.size;
  const prev = sessions.get(presence.sessionId);
  //  끊겨 있다 돌아온 세션은 새로 붙은 것처럼 맨 아래로(firstSeenAt 갱신) + 알림
  const returned = !!prev && !isConnected(prev, now);
  sessions.set(presence.sessionId, { ...presence, lastSeenAt: now, firstSeenAt: prev && !returned ? prev.firstSeenAt : now });
  prune(sessions, now);
  const changed = !prev || returned || prev.source !== presence.source || prev.label !== presence.label || before !== sessions.size;
  return { changed };
}

/** 보존 중인 세션 전부(끊긴 것 포함) — 먼저 연결된 순(같으면 ID 순). 하트비트마다 순서가 바뀌면 사용자가 헷갈린다 (#322 후속) */
export function listSourceSessions(userId: number, now = Date.now()): SourcePresence[] {
  const sessions = rooms.get(userId);
  if (!sessions) return [];
  prune(sessions, now);
  return [...sessions.values()].sort((a, b) => a.firstSeenAt - b.firstSeenAt || a.sessionId.localeCompare(b.sessionId));
}

/** 특정 세션 — 보존 목록에 없으면 null. connectedOnly 면 지금 붙어 있는 것만 */
export function getSourceSession(userId: number, sessionId: string, opts: { connectedOnly?: boolean } = {}, now = Date.now()): SourcePresence | null {
  const sessions = rooms.get(userId);
  if (!sessions) return null;
  prune(sessions, now);
  const found = sessions.get(sessionId) ?? null;
  if (found && opts.connectedOnly && !isConnected(found, now)) return null;
  return found;
}

export function clearSource(userId: number) {
  rooms.delete(userId);
}
