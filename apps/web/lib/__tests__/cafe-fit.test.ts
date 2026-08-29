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

import { fitLines, wrapText } from '../cafe-fit';

describe('wrapText — 폭에서 줄바꿈, 마지막 줄 ellipsis', () => {
  it('폭 안이면 한 줄', () => {
    expect(wrapText(measure, '짧은 제목', 20, 1000, 3)).toEqual(['짧은 제목']);
  });
  it('글자 단위로 채우되 근처 공백에서 끊는다', () => {
    // size 20 → 글자당 10px, 폭 100 → 줄당 10자. 둘째 줄은 11자라 넘치므로 근처 공백에서 끊는다
    expect(wrapText(measure, '가나다라마 바사아자차 카타파하하', 20, 100, 5)).toEqual(['가나다라마', '바사아자차', '카타파하하']);
    expect(wrapText(measure, '가나다라마 바사아자차', 20, 100, 5)).toEqual(['가나다라마', '바사아자차']);
  });
  it('줄 수를 넘기면 마지막 줄을 잘라 …', () => {
    const lines = wrapText(measure, '가'.repeat(35), 20, 100, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    expect(measure(lines[1], 20)).toBeLessThanOrEqual(100);
  });
});

describe('fitLines — 여러 줄 자동 크기', () => {
  it('1줄이면 fitText 와 같다', () => {
    expect(fitLines(measure, '짧음', { w: 1000, h: 50 }, 1, null)).toEqual({ lines: ['짧음'], size: 40 });
  });
  it('(높이÷줄 수)의 80% 에서 시작해 ellipsis 가 없어질 때까지 줄인다', () => {
    // 높이 100 / 2줄 → 40 에서 시작. 폭 200 이면 40px 로 줄당 10자 → 2줄 20자. 30자 제목은 줄여야 한다
    const r = fitLines(measure, '가'.repeat(30), { w: 200, h: 100 }, 2, null);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[1].endsWith('…')).toBe(false);
    expect(r.size).toBeLessThan(40);
  });
  it('고정 크기는 줄이지 않는다', () => {
    const r = fitLines(measure, '가'.repeat(30), { w: 200, h: 100 }, 2, 40);
    expect(r.size).toBe(40);
    expect(r.lines[1].endsWith('…')).toBe(true);
  });
});
