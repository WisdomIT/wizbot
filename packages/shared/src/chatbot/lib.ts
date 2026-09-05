/**
 * 치지직 채팅 한 건의 최대 길이 (`POST /open/v1/chats/send`).
 * 넘기면 전송이 실패하고 시청자에게는 아무 응답도 가지 않는다 (#115).
 */
export const CHAT_MAX_LENGTH = 100;

/**
 * 뒤에 꼭 남겨야 할 부분(링크·안내)을 지키면서 본문을 줄인다.
 *
 * 그냥 뒤에서 자르면 링크가 잘려 못 쓰게 되므로, 접미사 자리를 먼저 확보하고
 * 본문을 말줄임한다. 본문을 아무리 줄여도 안 들어가면 그때는 전체를 자른다.
 */
export function fitChatMessage(head: string, body: string, tail = ''): string {
  const budget = CHAT_MAX_LENGTH - head.length - tail.length;
  if (budget <= 0) return `${head}${body}${tail}`.slice(0, CHAT_MAX_LENGTH);
  if (body.length <= budget) return `${head}${body}${tail}`;

  // 말줄임표 한 글자까지 예산 안에 넣는다
  const trimmed = budget > 1 ? `${body.slice(0, budget - 1)}…` : body.slice(0, budget);
  return `${head}${trimmed}${tail}`;
}

/** 어떤 경로로 만들어진 메시지든 전송 전에 한 번 더 자른다 */
export function clampChatMessage(message: string): string {
  return message.length <= CHAT_MAX_LENGTH
    ? message
    : `${message.slice(0, CHAT_MAX_LENGTH - 1)}…`;
}

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

/**
 * 에이전트 응답을 채팅용으로 (#238) — 마크다운 표기를 벗기고 100자 단위로 나눈다.
 * 채팅은 흐르는 매체라 길게 쪼개봐야 도배다: 최대 maxParts 개, 넘치면 말줄임.
 */
export function splitForChat(text: string, maxParts = 3): string[] {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 $2')
    .replace(/[*_`#>]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return [];

  const parts: string[] = [];
  let rest = plain;
  while (rest && parts.length < maxParts) {
    if (rest.length <= CHAT_MAX_LENGTH) {
      parts.push(rest);
      break;
    }
    //  한도 안의 마지막 공백에서 끊는다 — 단어 중간이 잘리지 않게
    const window = rest.slice(0, CHAT_MAX_LENGTH);
    const cut = window.lastIndexOf(' ') > CHAT_MAX_LENGTH * 0.6 ? window.lastIndexOf(' ') : CHAT_MAX_LENGTH;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest && parts.length === maxParts) {
    const last = parts[maxParts - 1];
    parts[maxParts - 1] = `${last.slice(0, CHAT_MAX_LENGTH - 1)}…`.slice(0, CHAT_MAX_LENGTH);
  }
  return parts;
}
