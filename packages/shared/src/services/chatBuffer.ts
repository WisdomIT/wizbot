/**
 * 최근 채팅 버퍼 (#248) — 에이전트가 방송 맥락을 읽는 창.
 *
 * 챗봇 워커가 모든 채팅을 배치로 릴레이하면 api 프로세스 메모리에 채널별로
 * 최근 3분치만 유지한다. DB 에는 저장하지 않는다 — 시청자 채팅을 남기지 않기
 * 위해서고, api 가 재시작하면 버퍼는 비었다가 다시 채워진다.
 *
 * 임시제한·채팅 블라인드 API 의 입력값(chatChannelId·messageTime·senderChannelId)을
 * 함께 담아 조치 tool 이 버퍼에서 대상을 특정할 수 있게 한다.
 */

export interface RecentChatEntry {
  /** 수신 시각 (ms) — 3분 창 판정 기준 */
  at: number;
  senderChannelId: string;
  nickname: string;
  role: 'STREAMER' | 'MANAGER' | 'VIEWER';
  content: string;
  /** 임시제한·블라인드에 필요. CHAT 이벤트에 없으면 null */
  chatChannelId: string | null;
  /** 블라인드에 필요 (ms timestamp) */
  messageTime: number;
}

export const RECENT_CHAT_WINDOW_MS = 3 * 60_000;
/** 폭주 채널 보호 — 창 안이라도 이 수를 넘으면 오래된 것부터 버린다 */
const MAX_PER_CHANNEL = 600;

const buffers = new Map<number, RecentChatEntry[]>();

function prune(entries: RecentChatEntry[], now: number): RecentChatEntry[] {
  const cutoff = now - RECENT_CHAT_WINDOW_MS;
  const kept = entries.filter((entry) => entry.at >= cutoff);
  return kept.length > MAX_PER_CHANNEL ? kept.slice(kept.length - MAX_PER_CHANNEL) : kept;
}

export function pushRecentChat(userId: number, entries: RecentChatEntry[], now = Date.now()) {
  const current = buffers.get(userId) ?? [];
  buffers.set(userId, prune([...current, ...entries], now));
}

/** 최근 순서 유지(오래된 것 → 최신), 최신 limit 건만 */
export function getRecentChat(userId: number, limit = 150, now = Date.now()): RecentChatEntry[] {
  const pruned = prune(buffers.get(userId) ?? [], now);
  buffers.set(userId, pruned);
  return pruned.slice(Math.max(0, pruned.length - limit));
}

/** 대상 시청자의 최근 채팅 — 조치 카드의 근거와 API 입력값을 여기서 찾는다 */
export function findRecentChatBySender(
  userId: number,
  senderChannelId: string,
  now = Date.now(),
): RecentChatEntry[] {
  return getRecentChat(userId, MAX_PER_CHANNEL, now).filter(
    (entry) => entry.senderChannelId === senderChannelId,
  );
}

/** 테스트용 초기화 */
export function clearRecentChat(userId?: number) {
  if (userId === undefined) buffers.clear();
  else buffers.delete(userId);
}
