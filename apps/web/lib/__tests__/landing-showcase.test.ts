import { describe, expect, it } from 'vitest';

import { keyboardTarget, nextIndex, progressRatio } from '../landing-showcase';

describe('랜딩 쇼케이스 로직 (#277)', () => {
  it('nextIndex — 마지막 뒤는 처음, 빈 목록은 0', () => {
    expect(nextIndex(0, 6)).toBe(1);
    expect(nextIndex(5, 6)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });
  it('progressRatio — 0~1 로 자르고 전체가 없으면 0', () => {
    expect(progressRatio(5, 10)).toBe(0.5);
    expect(progressRatio(12, 10)).toBe(1);
    expect(progressRatio(3, NaN)).toBe(0);
    expect(progressRatio(3, 0)).toBe(0);
  });
  it('keyboardTarget — 방향키·Home/End, 무관한 키는 null', () => {
    expect(keyboardTarget('ArrowDown', 0, 3)).toBe(1);
    expect(keyboardTarget('ArrowRight', 2, 3)).toBe(0);
    expect(keyboardTarget('ArrowUp', 0, 3)).toBe(2);
    expect(keyboardTarget('Home', 2, 3)).toBe(0);
    expect(keyboardTarget('End', 0, 3)).toBe(2);
    expect(keyboardTarget('Enter', 0, 3)).toBeNull();
  });
});
