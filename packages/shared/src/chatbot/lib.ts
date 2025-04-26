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

export function formatTime(milliseconds: number): string {
  // 시간, 분, 초 계산
  let hours = Math.floor(milliseconds / (1000 * 60 * 60));
  let minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
  let seconds = Math.floor((milliseconds % (1000 * 60)) / 1000);

  // 한 자리 숫자에 '0' 추가
  const hoursString = hours < 10 ? '0' + hours : hours.toString();
  const minutesString = minutes < 10 ? '0' + minutes : minutes.toString();
  const secondsString = seconds < 10 ? '0' + seconds : seconds.toString();

  if (hours === 0) {
    return `${minutesString}분 ${secondsString}초`;
  } else {
    return `${hoursString}시간 ${minutesString}분 ${secondsString}초`;
  }
}
