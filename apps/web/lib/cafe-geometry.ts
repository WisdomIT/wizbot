/**
 * 카페 에디터 기하 유틸 (#9 PR2b) — 스냅 가이드·정렬·분배. DOM 없음, 순수 함수.
 * 좌표는 캔버스 원본 픽셀.
 */
export type Rect = { x: number; y: number; w: number; h: number };
export type Guide = { axis: 'x' | 'y'; at: number };
export type SnapLines = { xs: number[]; ys: number[] };
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** 스냅 대상 선 — 캔버스 가장자리·중앙 + 다른 요소들의 가장자리·중앙 */
export function collectSnapLines(canvas: { width: number; height: number }, others: Rect[]): SnapLines {
  const xs = [0, canvas.width / 2, canvas.width];
  const ys = [0, canvas.height / 2, canvas.height];
  for (const r of others) {
    xs.push(r.x, r.x + r.w / 2, r.x + r.w);
    ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { xs, ys };
}

/** values 중 하나가 lines 중 하나에 threshold 안으로 붙으면 가장 가까운 것 */
function nearest(values: number[], lines: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const v of values) {
    for (const l of lines) {
      const delta = l - v;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: l };
    }
  }
  return best;
}

/** 이동 스냅 — 좌/중/우, 상/중/하 중 가장 가까운 선에 붙인다 */
export function snapMove(rect: Rect, lines: SnapLines, threshold: number): { x: number; y: number; guides: Guide[] } {
  const sx = nearest([rect.x, rect.x + rect.w / 2, rect.x + rect.w], lines.xs, threshold);
  const sy = nearest([rect.y, rect.y + rect.h / 2, rect.y + rect.h], lines.ys, threshold);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: 'x', at: sx.at });
  if (sy) guides.push({ axis: 'y', at: sy.at });
  return { x: rect.x + (sx?.delta ?? 0), y: rect.y + (sy?.delta ?? 0), guides };
}

/** 리사이즈 스냅 — 움직이는 변만 붙이고 반대 변은 고정 */
export function snapResize(rect: Rect, handle: Handle, lines: SnapLines, threshold: number): { rect: Rect; guides: Guide[] } {
  let { x, y, w, h } = rect;
  const guides: Guide[] = [];
  if (handle.includes('e')) {
    const s = nearest([x + w], lines.xs, threshold);
    if (s) { w += s.delta; guides.push({ axis: 'x', at: s.at }); }
  } else if (handle.includes('w')) {
    const s = nearest([x], lines.xs, threshold);
    if (s) { x += s.delta; w -= s.delta; guides.push({ axis: 'x', at: s.at }); }
  }
  if (handle.includes('s')) {
    const s = nearest([y + h], lines.ys, threshold);
    if (s) { h += s.delta; guides.push({ axis: 'y', at: s.at }); }
  } else if (handle.includes('n')) {
    const s = nearest([y], lines.ys, threshold);
    if (s) { y += s.delta; h -= s.delta; guides.push({ axis: 'y', at: s.at }); }
  }
  return { rect: { x, y, w, h }, guides };
}

export function boundsOf(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 두 점으로 정규화된 사각형 (드래그 영역 선택) */
export function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export type AlignOp = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom' | 'distributeX' | 'distributeY';

/**
 * 파워포인트식 정렬. frame 은 기준 사각형(여러 개면 선택 영역, 하나면 캔버스).
 * 균등 분배는 첫/끝 요소를 고정하고 사이 간격을 같게 — 3개 미만이면 그대로.
 */
export function alignRects<T extends Rect>(items: T[], op: AlignOp, frame: Rect): T[] {
  switch (op) {
    case 'left': return items.map((r) => ({ ...r, x: frame.x }));
    case 'centerX': return items.map((r) => ({ ...r, x: Math.round(frame.x + (frame.w - r.w) / 2) }));
    case 'right': return items.map((r) => ({ ...r, x: frame.x + frame.w - r.w }));
    case 'top': return items.map((r) => ({ ...r, y: frame.y }));
    case 'centerY': return items.map((r) => ({ ...r, y: Math.round(frame.y + (frame.h - r.h) / 2) }));
    case 'bottom': return items.map((r) => ({ ...r, y: frame.y + frame.h - r.h }));
    case 'distributeX':
    case 'distributeY': {
      if (items.length < 3) return items;
      const key = op === 'distributeX' ? 'x' : 'y';
      const size = op === 'distributeX' ? 'w' : 'h';
      const sorted = [...items].sort((a, b) => a[key] - b[key]);
      const first = sorted[0]; const last = sorted[sorted.length - 1];
      const total = sorted.reduce((s, r) => s + r[size], 0);
      const gap = (last[key] + last[size] - first[key] - total) / (sorted.length - 1);
      let cursor = first[key];
      const moved = new Map<T, number>();
      for (const r of sorted) { moved.set(r, Math.round(cursor)); cursor += r[size] + gap; }
      return items.map((r) => ({ ...r, [key]: moved.get(r)! }));
    }
  }
}
