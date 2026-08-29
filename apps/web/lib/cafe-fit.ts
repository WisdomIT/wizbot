const ELLIPSIS = '…';

/**
 * 영역에 맞는 글자 크기 (#9 PR2). 순수 함수 — 측정 함수를 주입받아 캔버스 없이 테스트한다.
 * fontSize 가 고정이면 그대로, 아니면 높이의 80% 에서 시작해 폭을 넘으면 줄인다(최소 12px).
 * 그래도 넘치면 뒤에서 잘라 ellipsis.
 */
export function fitText(
  measure: (text: string, size: number) => number,
  text: string,
  box: { w: number; h: number },
  fixedSize: number | null,
): { text: string; size: number } {
  const MIN = 12;
  let size = fixedSize ?? Math.max(MIN, Math.floor(box.h * 0.8));
  if (fixedSize === null) {
    while (size > MIN && measure(text, size) > box.w) size -= 1;
  }
  if (measure(text, size) <= box.w) return { text, size };
  let cut = text;
  while (cut.length > 0 && measure(cut + ELLIPSIS, size) > box.w) cut = cut.slice(0, -1);
  return { text: cut ? cut + ELLIPSIS : ELLIPSIS, size };
}
