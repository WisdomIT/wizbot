export function splitContent(content: string, slice: number): string[] {
  if (!content.startsWith('!')) {
    throw new Error("커맨드는 반드시 '!'로 시작해야 합니다.");
  }

  // prefix 제거하고 공백으로 나누기
  const args = content.slice(1).trim().split(/\s+/);

  // slice가 음수면 0으로, 너무 크면 전체로
  const head = args.slice(0, Math.max(0, slice));
  const tail = args.slice(slice).join(' ');

  return [...head, tail];
}
