import { ChatbotFunctionHandler } from '.';
import { getAgentChatMode } from './agentBridge';
import { splitContent } from './lib';

/** 채팅 에이전트 호출 (#238) — 실제 처리는 api 가 등록한 구현이 비동기로 수행한다 */
export const functionAgent = {
  agentChat: (async (_ctx, data) => {
    const [request] = splitContent(data.content, data.query.command, 1);
    const mode = getAgentChatMode();
    if (!mode) return { ok: true, message: '에이전트를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.' };
    return mode.start({ userId: data.userId, request: request || null });
  }) satisfies ChatbotFunctionHandler,
};
