/**
 * 화면 어디서든 에이전트 패널을 열고 첫 메시지를 보내는 브리지 (#276).
 * 패널은 사이드바 셸에 한 번만 마운트되므로 window 이벤트로 신호를 보낸다.
 */
export const AGENT_OPEN_EVENT = 'wizbot:agent-open';

export interface AgentOpenDetail {
  /** 새 대화를 열고 바로 보낼 메시지 */
  message: string;
}

export function openAgentWith(message: string) {
  window.dispatchEvent(new CustomEvent<AgentOpenDetail>(AGENT_OPEN_EVENT, { detail: { message } }));
}
