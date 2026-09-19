/**
 * 랜딩 쇼케이스의 순수 로직 (#277) — 컴포넌트와 분리해 테스트한다.
 */

/** 순환 인덱스 — 마지막 뒤는 처음 */
export function nextIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return (index + 1) % length;
}

/** 진행률 0~1 — 전체가 없거나 0 이면 0 */
export function progressRatio(elapsed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(elapsed)) return 0;
  return Math.min(1, Math.max(0, elapsed / total));
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

/** 자동 순환 타이머 틱(ms) — 진행 바 갱신 주기 */
export const TICK_MS = 100;
