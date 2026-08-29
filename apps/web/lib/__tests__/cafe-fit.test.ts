import { describe, expect, it } from 'vitest';

import { fitText } from '../cafe-fit';

//  글자당 폭 = size * 0.5 인 가상 폰트
const measure = (text: string, size: number) => text.length * size * 0.5;

describe('fitText — 영역 높이에서 글자 크기, 폭 초과 시 축소 → ellipsis', () => {
  it('높이의 80% 로 시작한다', () => {
    expect(fitText(measure, '짧음', { w: 1000, h: 50 }, null)).toEqual({ text: '짧음', size: 40 });
  });
  it('폭을 넘으면 맞을 때까지 줄인다', () => {
    // 10자 × size×0.5 ≤ 200 → size ≤ 40 이지만 높이 100 → 80 에서 시작해 40 까지 줄어든다
    expect(fitText(measure, '1234567890', { w: 200, h: 100 }, null).size).toBe(40);
  });
  it('최소 12px 에서도 넘치면 ellipsis', () => {
    const r = fitText(measure, 'a'.repeat(100), { w: 60, h: 100 }, null);
    expect(r.size).toBe(12);
    expect(r.text.endsWith('…')).toBe(true);
    expect(measure(r.text, 12)).toBeLessThanOrEqual(60);
  });
  it('고정 크기는 줄이지 않고 바로 ellipsis', () => {
    const r = fitText(measure, 'a'.repeat(50), { w: 100, h: 100 }, 40);
    expect(r.size).toBe(40);
    expect(r.text).toBe('aaaa…');
  });
});
