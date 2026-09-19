/**
 * 랜딩 쇼케이스의 순수 로직 (#277) — 컴포넌트와 분리해 테스트한다.
 */

/** 순환 인덱스 — 마지막 뒤는 처음 */
export function nextIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (index + 1) % length;
}

/** 진행률 0~1 — duration 이 없거나 0 이면 0 */
export function progressRatio(currentTime: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(currentTime)) return 0;
  return Math.min(1, Math.max(0, currentTime / duration));
}

/** 미리 받을 항목 — 현재와 다음 하나만 (6개 동시 로드 금지). 한 개뿐이면 그것만 */
export function preloadIndexes(index: number, length: number): number[] {
  if (length <= 0) return [];
  const next = nextIndex(index, length);
  return next === index ? [index] : [index, next];
}

/** 방향키 탐색 — Home/End, ArrowUp/Left = 이전, ArrowDown/Right = 다음. 관련 없는 키는 null */
export function keyboardTarget(key: string, index: number, length: number): number | null {
  if (length <= 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return nextIndex(index, length);
    case 'ArrowUp':
    case 'ArrowLeft':
      return (index - 1 + length) % length;
    case 'Home':
      return 0;
    case 'End':
      return length - 1;
    default:
      return null;
  }
}

/** 영상이 없거나 못 불러왔을 때 플레이스홀더를 보여주는 시간(ms) — 그 뒤 다음 항목으로 넘어간다 */
export const PLACEHOLDER_DWELL_MS = 8_000;
