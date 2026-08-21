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
  /** 창을 여러 개 열었을 때 최신 하나만 활성으로 삼는다 */
  sessionId: string;
  lastSeenAt: number;
}

/**
 * 하트비트가 이 시간 이상 끊기면 오프라인으로 본다.
 * 송출 소스는 5초마다 보내므로 3번 연속 놓쳐야 끊긴 것으로 판정한다
 * (한 번쯤 늦는다고 「연결 안 됨」이 깜빡이지 않게).
 */
export const SOURCE_TIMEOUT_MS = 15_000;

const presences = new Map<number, SourcePresence>();

/**
 * 하트비트 수신. 연결이 새로 생기거나 소스/세션이 바뀐 경우에만 changed 가 true 다.
 * 매번 이벤트를 쏘면 구독자 전원이 5초마다 전체 상태를 다시 읽게 되므로 전환 때만 알린다.
 */
export function touchSource(
  userId: number,
  source: string,
  sessionId: string,
): { changed: boolean } {
  const previous = getSourcePresence(userId);
  presences.set(userId, { source, sessionId, lastSeenAt: Date.now() });

  return {
    changed:
      previous === null || previous.sessionId !== sessionId || previous.source !== source,
  };
}

export function getSourcePresence(userId: number): SourcePresence | null {
  const presence = presences.get(userId);
  if (!presence) return null;
  if (Date.now() - presence.lastSeenAt > SOURCE_TIMEOUT_MS) return null;
  return presence;
}

/** 이 세션이 현재 활성 세션인지 — 중복 실행된 창은 재생하지 않는다 */
export function isActiveSession(userId: number, sessionId: string): boolean {
  return getSourcePresence(userId)?.sessionId === sessionId;
}

export function clearSource(userId: number) {
  presences.delete(userId);
}
