import type { CafeSnapshot } from './cafeLayout';

/**
 * 대문 갱신 정책 (#9 PR3b, 이슈 §3). 저장 1회 = 대문 편집기를 열어 저장하는 왕복이므로 필요할 때만 저장한다.
 *
 * | 조건 | 동작 |
 * |---|---|
 * | 방송 여부·제목·카테고리 변화 | 즉시 |
 * | 시청자 수 구간 변경 | 마지막 저장 후 1분 지났으면 |
 * | 방송 중 & 마지막 저장 후 5분 | 강제 (썸네일·시청자 수 갱신) |
 * | 방송 종료 | 강제 저장 없음 |
 *
 * 시청자 구간: ≤1,000 은 50명 단위(히스테리시스 10), 초과는 100명 단위(30). 경계를 히스테리시스보다
 * 더 넘어야 구간 변경으로 본다 — 2,999↔3,001 진동으로 1분마다 저장되는 걸 막는다. 이미지에는 원본값을 그린다.
 */
export const VIEWER_SAVE_MIN_MS = 60 * 1000;
export const FORCE_SAVE_MS = 5 * 60 * 1000;
/** 저장 실패 재시도 간격 */
export const RETRY_MS = 60 * 1000;

function unitOf(n: number): number {
  return n > 1000 ? 100 : 50;
}
function hysteresisOf(n: number): number {
  return n > 1000 ? 30 : 10;
}

/** 시청자 수 → 구간 시작값 */
export function viewerBucket(n: number): number {
  const v = Math.max(0, Math.floor(n));
  return Math.floor(v / unitOf(v)) * unitOf(v);
}

/** 마지막 저장 구간에서 히스테리시스 폭 이상 벗어났는가 */
export function bucketChanged(prevBucket: number | null, n: number): boolean {
  if (prevBucket === null) return true;
  if (viewerBucket(n) === prevBucket) return false;
  const unit = unitOf(prevBucket + 1);
  const hyst = hysteresisOf(prevBucket + 1);
  return n < prevBucket - hyst || n >= prevBucket + unit + hyst;
}

export type SaveReason = 'first' | 'state' | 'viewers' | 'force';

export function decideSave(
  prev: { snapshot: CafeSnapshot | null; savedAt: Date | null; bucket: number | null },
  next: CafeSnapshot,
  now: Date,
): SaveReason | null {
  if (!prev.snapshot || !prev.savedAt) return 'first';
  const p = prev.snapshot;
  if (p.live !== next.live || p.title !== next.title || p.category !== next.category) return 'state';
  if (!next.live) return null;
  const since = now.getTime() - prev.savedAt.getTime();
  if (since >= FORCE_SAVE_MS) return 'force';
  if (since >= VIEWER_SAVE_MIN_MS && bucketChanged(prev.bucket, next.viewers)) return 'viewers';
  return null;
}
