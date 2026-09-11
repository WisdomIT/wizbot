import { ChatbotFunctionHandler } from '.';
import { getAgentChatMode } from './agentBridge';
import { splitContent } from './lib';

/**
 * 채팅 에이전트 호출 (#238) — 실제 처리는 api 가 등록한 구현이 비동기로 수행한다.
 * 부른 사람이 세션의 주인이다 (#262) — 명령어 권한을 가진 스트리머·매니저가 각자 창을 연다
 */
export const functionAgent = {
  agentChat: (async (_ctx, data) => {
    const [request] = splitContent(data.content, data.query.command, 1);
    const mode = getAgentChatMode();
    if (!mode) return { ok: true, message: '에이전트를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.' };
    return mode.start({
      userId: data.userId,
      //  채널 id 가 없는 경로(테스트·구형 이벤트)는 닉네임으로 대신 — 같은 사람이면 같은 창
      sender: { channelId: data.senderChannelId ?? data.senderNickname, nickname: data.senderNickname },
      request: request || null,
    });
  }) satisfies ChatbotFunctionHandler,
};
