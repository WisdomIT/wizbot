import { describe, expect, it } from 'vitest';

import { alignRects, boundsOf, collectSnapLines, intersects, rectFromPoints, snapMove, snapResize } from '../cafe-geometry';

const canvas = { width: 800, height: 300 };

describe('스냅 (#9 PR2b)', () => {
  it('캔버스 가장자리·중앙과 다른 요소의 가장자리·중앙이 스냅선', () => {
    const lines = collectSnapLines(canvas, [{ x: 100, y: 50, w: 200, h: 100 }]);
    expect(lines.xs).toEqual([0, 400, 800, 100, 200, 300]);
    expect(lines.ys).toEqual([0, 150, 300, 50, 100, 150]);
  });
  it('이동: 임계값 안이면 가장 가까운 선에 붙고 가이드를 돌려준다', () => {
    const lines = collectSnapLines(canvas, []);
    // 왼쪽 변 x=4 → 0 에 붙는다
    expect(snapMove({ x: 4, y: 120, w: 100, h: 40 }, lines, 6)).toEqual({ x: 0, y: 120, guides: [{ axis: 'x', at: 0 }] });
    // 가운데 (x+w/2 = 397) → 400. 세로 중앙 (y+h/2 = 148) → 150
    expect(snapMove({ x: 347, y: 128, w: 100, h: 40 }, lines, 6)).toEqual({ x: 350, y: 130, guides: [{ axis: 'x', at: 400 }, { axis: 'y', at: 150 }] });
  });
  it('이동: 임계값 밖이면 그대로', () => {
    expect(snapMove({ x: 20, y: 20, w: 100, h: 40 }, collectSnapLines(canvas, []), 6)).toEqual({ x: 20, y: 20, guides: [] });
  });
  it('리사이즈: 잡은 변만 붙고 반대 변은 고정', () => {
    const lines = collectSnapLines(canvas, [{ x: 500, y: 0, w: 100, h: 100 }]);
    const r = snapResize({ x: 100, y: 10, w: 397, h: 50 }, 'e', lines, 6);
    expect(r.rect).toEqual({ x: 100, y: 10, w: 400, h: 50 });
    expect(r.guides).toEqual([{ axis: 'x', at: 500 }]);
    const w = snapResize({ x: 597, y: 10, w: 100, h: 50 }, 'nw', lines, 6);
    expect(w.rect).toEqual({ x: 600, y: 10, w: 97, h: 50 }); // 왼쪽 변이 600 으로, 오른쪽 변(697)은 그대로
  });
});

describe('영역·교차', () => {
  it('boundsOf / intersects / rectFromPoints', () => {
    expect(boundsOf([{ x: 10, y: 20, w: 30, h: 40 }, { x: 50, y: 0, w: 10, h: 10 }])).toEqual({ x: 10, y: 0, w: 50, h: 60 });
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false); // 변만 닿으면 아님
    expect(rectFromPoints({ x: 50, y: 60 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 40, h: 40 });
  });
});

describe('정렬·분배', () => {
  const items = [
    { id: 'a', x: 10, y: 10, w: 100, h: 20 },
    { id: 'b', x: 200, y: 50, w: 50, h: 40 },
    { id: 'c', x: 400, y: 100, w: 20, h: 10 },
  ];
  const frame = boundsOf(items); // x 10..420, y 10..110
  it('왼쪽/가운데/오른쪽', () => {
    expect(alignRects(items, 'left', frame).map((r) => r.x)).toEqual([10, 10, 10]);
    expect(alignRects(items, 'right', frame).map((r) => r.x)).toEqual([320, 370, 400]);
    expect(alignRects(items, 'centerX', frame).map((r) => r.x)).toEqual([165, 190, 205]);
  });
  it('위/중간/아래', () => {
    expect(alignRects(items, 'top', frame).map((r) => r.y)).toEqual([10, 10, 10]);
    expect(alignRects(items, 'bottom', frame).map((r) => r.y)).toEqual([90, 70, 100]);
    expect(alignRects(items, 'centerY', frame).map((r) => r.y)).toEqual([50, 40, 55]);
  });
  it('가로 균등 분배 — 첫/끝 고정, 간격 같게, id 유지', () => {
    const out = alignRects(items, 'distributeX', frame);
    // 전체 폭 410 - 요소 폭 합 170 = 240 → 간격 120
    expect(out.map((r) => [r.id, r.x])).toEqual([['a', 10], ['b', 230], ['c', 400]]);
    expect(alignRects(items.slice(0, 2), 'distributeX', frame)).toEqual(items.slice(0, 2));
  });
  it('하나만 선택하면 캔버스 기준', () => {
    expect(alignRects([items[1]], 'centerX', { x: 0, y: 0, w: 800, h: 300 })[0].x).toBe(375);
  });
});
