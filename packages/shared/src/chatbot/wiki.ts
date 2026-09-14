import { ChatbotFunctionHandler } from '.';
import { getWikiAnswerMode } from './wikiBridge';

/** 질문 길이 상한 — 채팅 한 줄 */
export const WIKI_QUESTION_MAX = 200;

/**
 * `!봉누도 <질문>` (#309) — 한 번에 끝나는 명령어. 명령어 뒤 전체를 질문으로 보고(공백으로 쪼개지 않는다),
 * 비어 있으면 용법 안내. 실제 답변(검색·LLM·한도)은 api 가 등록한 구현이 한다
 */
export const functionWiki = {
  wikiAnswer: (async (_ctx, data) => {
    const question = data.content.slice(1).trim().slice(data.query.command.length).trim();
    if (!question) {
      return { ok: true, usageError: true, message: `질문을 함께 적어주세요. 예) !${data.query.command} 낚싯대는 어디서 사?` };
    }
    if (question.length > WIKI_QUESTION_MAX) {
      return { ok: true, usageError: true, message: `질문은 ${WIKI_QUESTION_MAX}자까지입니다.` };
    }
    const sourceId = Number(data.query.option);
    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return { ok: true, message: '이 명령어에 위키가 연결되어 있지 않습니다. 콘솔에서 명령어를 수정해주세요.' };
    }
    const mode = getWikiAnswerMode();
    if (!mode) return { ok: true, message: '위키 답변을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.' };
    const result = await mode.answer({
      userId: data.userId,
      sourceId,
      question,
      sender: { channelId: data.senderChannelId ?? data.senderNickname, nickname: data.senderNickname, role: data.senderRole },
    });
    return { ok: result.ok, message: result.message, ...(result.messages ? { messages: result.messages } : {}) };
  }) satisfies ChatbotFunctionHandler,
};
