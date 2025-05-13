/**
 *
 * @param content 채팅 내용
 * @param command 검색된 명령어
 * @param slice 명령어를 몇 개로 나눌 것인지
 * @description
 * content에서 명령어를 나누는 함수입니다.
 * content는 반드시 '!'로 시작해야 하며, command는 content에서 정확히 매칭되어야 합니다.
 * 나누어진 명령어는 배열로 반환됩니다.
 * 예를 들어, content가 `!명령어 arg1 arg2 arg3`이고, command가 `명령어`이며, slice가 2라면,
 * `['arg1', 'arg2 arg3']`이 반환됩니다.
 * @returns 명령어를 나눈 배열
 */
export function splitContent(content: string, command: string, slice: number): string[] {
  if (!content.startsWith('!')) {
    throw new Error("커맨드는 반드시 '!'로 시작해야 합니다.");
  }

  const fullCommand = content.slice(1).trim();
  if (!fullCommand.startsWith(command)) {
    throw new Error('content에서 command가 정확히 매칭되지 않았습니다.');
  }

  const rest = fullCommand.slice(command.length).trim();
  const args = rest.length > 0 ? rest.split(/\s+/) : [];

  const actualSlice = Math.max(0, slice);
  const head = args.slice(0, actualSlice - 1);
  const tail = args.slice(actualSlice - 1).join(' ');

  if (actualSlice === 0) {
    return [tail];
  }

  return [...head, tail];
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.abs(Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const minutesString = minutes < 10 ? '0' + minutes : minutes.toString();
  const secondsString = seconds < 10 ? '0' + seconds : seconds.toString();
  const hoursString = hours < 10 ? '0' + hours : hours.toString();

  if (hours === 0) {
    return `${minutesString}분 ${secondsString}초`;
  } else {
    return `${hoursString}시간 ${minutesString}분 ${secondsString}초`;
  }
}
