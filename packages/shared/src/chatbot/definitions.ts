/**
 * 챗봇 function 명령어의 단일 정의 (#26 26-b).
 *
 * ⚠ 이 파일은 웹 클라이언트 번들에도 포함된다 — 순수 데이터만 두고
 *   prisma / chzzk-open-sdk / 핸들러 구현을 import 하지 말 것.
 *   실행 로직은 command.ts / chzzk.ts 의 핸들러가 담당하며,
 *   index.ts 의 `functions` 레지스트리가 키 일치를 컴파일 타임에 강제한다.
 */

export type ChatbotFunctionType = 'API_QUERY' | 'API_CONFIG' | 'WIZBOT_CONFIG';

/** 사용법 표기 토큰 — 웹은 arg 를 Badge 로, 문자열 표기는 `<arg>` 로 렌더한다 */
export type UsageToken = { text: string } | { arg: string };

export interface ChatbotFunctionOptionSpec {
  label: string;
  /**
   * 옵션 입력 UI 종류
   * - text: 자유 입력
   * - echoCommandSelect: 스트리머의 echo 명령어 중 선택 (저장 값은 echo 명령어 id)
   */
  input: 'text' | 'echoCommandSelect';
}

export interface ChatbotFunctionDefinition {
  name: string;
  type: ChatbotFunctionType;
  /** 목록/테이블용 한 줄 설명 */
  descriptionShort: string;
  /** 상세 설명 — \n\n 문단 구분 (웹은 whitespace-pre-line 렌더) */
  description: string;
  usageTokens: (command: string) => UsageToken[];
  option?: ChatbotFunctionOptionSpec;
}

const cmd = (command: string): UsageToken => ({ text: `!${command}` });
const arg = (name: string): UsageToken => ({ arg: name });

export const chatbotFunctionDefinitions = {
  /* ── 위즈봇 설정 (채팅으로 명령어 관리) ── */
  createCommandEcho: {
    name: 'echo 명령어 추가',
    type: 'WIZBOT_CONFIG',
    descriptionShort: '특정 메시지로 응답하는 명령어를 추가합니다.',
    description: '특정 메시지로 응답하는 echo 명령어를 추가합니다.',
    usageTokens: (c) => [cmd(c), arg('명령어 이름'), arg('응답')],
  },
  deleteCommandEcho: {
    name: 'echo 명령어 삭제',
    type: 'WIZBOT_CONFIG',
    descriptionShort: '특정 메시지로 응답하는 명령어를 삭제합니다.',
    description: '특정 메시지로 응답하는 echo 명령어를 삭제합니다.',
    usageTokens: (c) => [cmd(c), arg('명령어 이름')],
  },
  updateCommandEcho: {
    name: 'echo 명령어 수정',
    type: 'WIZBOT_CONFIG',
    descriptionShort: '특정 메시지로 응답하는 명령어를 수정합니다.',
    description: '특정 메시지로 응답하는 echo 명령어를 수정합니다.',
    usageTokens: (c) => [cmd(c), arg('명령어 이름'), arg('응답')],
  },
  updateSpecificCommandEcho: {
    name: 'echo 명령어 수정 (지정)',
    type: 'WIZBOT_CONFIG',
    descriptionShort: '특정 echo 명령어를 수정합니다.',
    description:
      '특정 echo 명령어를 수정합니다.\n\n"!멤버 수정" 과 같이 특정 명령어를 시청자가 수정할 수 있도록 하는 데 사용하기 좋습니다.',
    usageTokens: (c) => [cmd(c), arg('응답')],
    option: { label: 'echo 명령어', input: 'echoCommandSelect' },
  },
  createChatbotRepeat: {
    name: '반복 명령어 추가',
    type: 'WIZBOT_CONFIG',
    descriptionShort: '특정 메시지를 반복하는 명령어를 추가합니다.',
    description:
      "특정 메시지를 반복하는 명령어를 추가합니다.\n\n반복 주기는 '반복' 메뉴의 기본 주기로 자동 설정됩니다.",
    usageTokens: (c) => [cmd(c), arg('반복 메시지')],
  },
  deleteChatbotRepeat: {
    name: '반복 명령어 삭제',
    type: 'WIZBOT_CONFIG',
    descriptionShort: '특정 메시지를 반복하는 명령어를 삭제합니다.',
    description:
      '특정 메시지를 반복하는 명령어를 삭제합니다.\n\n옵션으로 삭제할 반복 메시지의 id 혹은 "all"을 입력하세요.',
    usageTokens: (c) => [cmd(c), arg('반복메시지 id'), { text: 'or' }, arg('all')],
  },

  /* ── 치지직 조회 ── */
  getChzzkTitle: {
    name: '방송 제목 조회',
    type: 'API_QUERY',
    descriptionShort: '방송 제목을 조회합니다.',
    description: '현재 방송 제목을 조회합니다.\n\n예) 제목: 안녕하세요',
    usageTokens: (c) => [cmd(c)],
  },
  getChzzkCategory: {
    name: '방송 카테고리 조회',
    type: 'API_QUERY',
    descriptionShort: '방송 카테고리를 조회합니다.',
    description: '현재 방송 카테고리를 조회합니다.\n\n예) 카테고리: talk',
    usageTokens: (c) => [cmd(c)],
  },
  getChzzkUptime: {
    name: '방송 시간 조회',
    type: 'API_QUERY',
    descriptionShort: '방송 시간을 조회합니다.',
    description: '방송 시간을 조회합니다.\n\n예) 업타임: 12시간 08분 03초',
    usageTokens: (c) => [cmd(c)],
  },
  getChzzkViewer: {
    name: '방송 시청자 수 조회',
    type: 'API_QUERY',
    descriptionShort: '방송 시청자 수를 조회합니다.',
    description: '방송 시청자 수를 조회합니다.\n\n예) 현재 시청자 수: 1234명',
    usageTokens: (c) => [cmd(c)],
  },

  getCommandListUrl: {
    name: '명령어 목록 링크',
    type: 'WIZBOT_CONFIG',
    descriptionShort: '명령어 목록 페이지 링크를 응답합니다.',
    description:
      '이 채널의 명령어 목록 페이지 링크를 응답합니다.\n\n시청자가 사용 가능한 명령어를 웹에서 확인할 수 있습니다.',
    usageTokens: (c) => [cmd(c)],
  },

  /* ── 치지직 설정 ── */
  updateChzzkTitle: {
    name: '방송 제목 수정',
    type: 'API_CONFIG',
    descriptionShort: '방송 제목을 수정합니다.',
    description: '현재 방송 제목을 수정합니다.',
    usageTokens: (c) => [cmd(c), arg('제목')],
  },
  updateChzzkCategory: {
    name: '방송 카테고리 수정',
    type: 'API_CONFIG',
    descriptionShort: '방송 카테고리를 수정합니다.',
    description:
      '현재 방송 카테고리를 수정합니다.\n\n입력하신 카테고리 이름으로 치지직에서 검색 후, 가장 첫번째 항목이 적용됩니다.\n예) 배그 → PUBG:배틀그라운드',
    usageTokens: (c) => [cmd(c), arg('카테고리')],
  },
  setChzzkNotice: {
    name: '방송 공지 설정',
    type: 'API_CONFIG',
    descriptionShort: '방송 공지를 설정합니다.',
    description: '방송 공지를 설정합니다.',
    usageTokens: (c) => [cmd(c), arg('공지')],
  },
} as const satisfies Record<string, ChatbotFunctionDefinition>;

export type ChatbotFunctionKey = keyof typeof chatbotFunctionDefinitions;

/**
 * 넓힌 타입 뷰 — as const 로 좁혀진 리터럴 타입 대신 공통 인터페이스로 접근할 때 사용
 * (optional 필드 `option` 을 항목 구분 없이 읽을 수 있다)
 */
export const chatbotFunctionDefinitionMap: Record<ChatbotFunctionKey, ChatbotFunctionDefinition> =
  chatbotFunctionDefinitions;

export function isChatbotFunctionKey(value: string): value is ChatbotFunctionKey {
  return value in chatbotFunctionDefinitions;
}

/** 토큰 배열 → 평문 사용법 (`!명령어 <인수>`) */
export function usageTokensToString(tokens: UsageToken[]): string {
  return tokens.map((token) => ('arg' in token ? `<${token.arg}>` : token.text)).join(' ');
}

export function getUsageString(key: ChatbotFunctionKey, command: string): string {
  return usageTokensToString(chatbotFunctionDefinitions[key].usageTokens(command));
}

/** 명령어 목록/테이블 표시용 파생값 */
export interface CommandDisplay {
  usageTokens: UsageToken[];
  usageString: string;
  descriptionShort: string;
}

const UNKNOWN_FUNCTION_DISPLAY: CommandDisplay = {
  usageTokens: [{ text: '사용법을 찾을 수 없습니다.' }],
  usageString: '사용법을 찾을 수 없습니다.',
  descriptionShort: '설명을 찾을 수 없습니다.',
};

/** function 명령어의 표시값 — DB 의 function 키가 정의에 없으면(구버전 잔재 등) 폴백 */
export function getFunctionCommandDisplay(functionKey: string, command: string): CommandDisplay {
  if (!isChatbotFunctionKey(functionKey)) return UNKNOWN_FUNCTION_DISPLAY;
  const tokens = chatbotFunctionDefinitions[functionKey].usageTokens(command);
  return {
    usageTokens: tokens,
    usageString: usageTokensToString(tokens),
    descriptionShort: chatbotFunctionDefinitions[functionKey].descriptionShort,
  };
}

/** echo 명령어의 표시값 */
export function getEchoCommandDisplay(command: string, response: string): CommandDisplay {
  return {
    usageTokens: [{ text: `!${command}` }],
    usageString: `!${command}`,
    descriptionShort: `응답: ${response}`,
  };
}
