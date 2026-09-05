/**
 * 채팅 에이전트 브리지 (#238). 챗봇 함수는 shared 에 살지만 에이전트 루프(LLM SDK)는
 * apps/api 에 있다 — 의존 방향을 지키기 위해 api 가 부팅 시 구현을 등록하고,
 * 핸들러·릴레이 라우트는 등록된 구현을 부른다. 미등록(테스트 등)이면 사용 불가 응답.
 */

export interface AgentChatStart {
  userId: number;
  /** `!에이전트 <요청>` 의 요청 부분 — 없으면 호출만 */
  request: string | null;
}

export interface AgentChatRelayInput {
  userId: number;
  content: string;
}

export interface AgentChatMode {
  /** `!에이전트` 명령 — 즉시 돌려줄 채팅 응답을 반환하고, 요청 처리는 비동기로 이어진다 */
  start(input: AgentChatStart): Promise<{ ok: boolean; message: string }>;
  /** 파싱 창 동안 스트리머의 일반 채팅 전달 — 창이 없으면 active:false */
  relay(input: AgentChatRelayInput): Promise<{ active: boolean }>;
}

let mode: AgentChatMode | null = null;

export function registerAgentChatMode(implementation: AgentChatMode) {
  mode = implementation;
}

export function getAgentChatMode(): AgentChatMode | null {
  return mode;
}
