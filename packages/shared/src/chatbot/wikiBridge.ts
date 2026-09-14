/**
 * 위키 답변 브리지 (#309). 검색·LLM 호출은 apps/api 에 있으므로(에이전트와 같은 이유) api 가 부팅 시 구현을 등록하고
 * 챗봇 핸들러는 등록된 구현을 부른다. 미등록(테스트 등)이면 사용 불가 응답
 */

export interface WikiAnswerInput {
  /** 채널 소유자(스트리머 유저 id) — 사용량·상한의 주인 */
  userId: number;
  sourceId: number;
  question: string;
  /** 발화자 — 쿨타임 키. 스트리머·매니저는 쿨타임을 받지 않는다 */
  sender: { channelId: string; nickname: string; role: 'STREAMER' | 'MANAGER' | 'VIEWER' };
}

export interface WikiAnswerResult {
  ok: boolean;
  /** 첫 채팅 (답변 또는 안내) */
  message: string;
  /** 이어서 보낼 채팅 — 출처 링크 */
  messages?: string[];
}

export interface WikiAnswerMode {
  answer(input: WikiAnswerInput): Promise<WikiAnswerResult>;
}

let mode: WikiAnswerMode | null = null;

export function registerWikiAnswerMode(implementation: WikiAnswerMode | null) {
  mode = implementation;
}

export function getWikiAnswerMode(): WikiAnswerMode | null {
  return mode;
}
