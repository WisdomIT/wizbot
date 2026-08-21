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
  /**
   * 송출 소스가 광고로 추정되는 재생을 감지/해제함 (#5).
   * DB 에 남길 값이 아니라 그 순간의 상태라 이벤트로만 흘린다.
   */
  | { type: 'ad'; active: boolean }
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

/** 하트비트가 이 시간 이상 끊기면 오프라인으로 본다 */
export const SOURCE_TIMEOUT_MS = 30_000;

const presences = new Map<number, SourcePresence>();

export function touchSource(userId: number, source: string, sessionId: string) {
  presences.set(userId, { source, sessionId, lastSeenAt: Date.now() });
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
