const ELLIPSIS = '…';

export type Measure = (text: string, size: number) => number;

/**
 * 한 줄에 맞는 글자 크기 (#9 PR2). 순수 함수 — 측정 함수를 주입받아 캔버스 없이 테스트한다.
 * fontSize 가 고정이면 그대로, 아니면 높이의 80% 에서 시작해 폭을 넘으면 줄인다(최소 12px).
 * 그래도 넘치면 뒤에서 잘라 ellipsis.
 */
export function fitText(measure: Measure, text: string, box: { w: number; h: number }, fixedSize: number | null): { text: string; size: number } {
  const MIN = 12;
  let size = fixedSize ?? Math.max(MIN, Math.floor(box.h * 0.8));
  if (fixedSize === null) {
    while (size > MIN && measure(text, size) > box.w) size -= 1;
  }
  if (measure(text, size) <= box.w) return { text, size };
  return { text: truncate(measure, text, size, box.w), size };
}

function truncate(measure: Measure, text: string, size: number, width: number): string {
  let cut = text;
  while (cut.length > 0 && measure(cut + ELLIPSIS, size) > width) cut = cut.slice(0, -1);
  return cut ? cut + ELLIPSIS : ELLIPSIS;
}

/**
 * 폭에 맞춰 줄바꿈. 한국어는 띄어쓰기가 불규칙하므로 글자 단위로 채우되, 잘리는 자리에 공백이
 * 가까우면 거기서 끊는다. maxLines 를 넘기면 마지막 줄을 잘라 ellipsis.
 */
export function wrapText(measure: Measure, text: string, size: number, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let rest = text.replace(/\s+/g, ' ').trim();
  while (rest.length > 0) {
    if (lines.length === maxLines - 1) {
      lines.push(measure(rest, size) <= width ? rest : truncate(measure, rest, size, width));
      return lines;
    }
    let end = rest.length;
    while (end > 1 && measure(rest.slice(0, end), size) > width) end -= 1;
    if (end < rest.length) {
      // 끊긴 자리 앞 8자 안에 공백이 있으면 거기서 — 단어 중간을 피한다
      const space = rest.lastIndexOf(' ', end);
      if (space > 0 && end - space <= 8) end = space;
    }
    lines.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  return lines.length ? lines : [''];
}

/**
 * 여러 줄 영역. 글자 크기가 자동이면 (높이 / 줄 수)의 80% 에서 시작해, 줄바꿈 결과가 줄 수를
 * 넘거나(= 마지막 줄이 ellipsis) 하면 줄인다 — 최소 12px 까지. 고정이면 바로 줄바꿈.
 */
export function fitLines(measure: Measure, text: string, box: { w: number; h: number }, maxLines: number, fixedSize: number | null): { lines: string[]; size: number } {
  const MIN = 12;
  if (maxLines <= 1) {
    const one = fitText(measure, text, box, fixedSize);
    return { lines: [one.text], size: one.size };
  }
  let size = fixedSize ?? Math.max(MIN, Math.floor((box.h / maxLines) * 0.8));
  let lines = wrapText(measure, text, size, box.w, maxLines);
  if (fixedSize === null) {
    const overflows = (ls: string[]) => ls[ls.length - 1]?.endsWith(ELLIPSIS) || ls.length * size * 1.2 > box.h;
    while (size > MIN && overflows(lines)) {
      size -= 1;
      lines = wrapText(measure, text, size, box.w, maxLines);
    }
  }
  return { lines, size };
}
