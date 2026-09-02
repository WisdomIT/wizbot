import type { Prisma } from '@prisma/client';
import { agentService, isServiceError } from '@wizbot/shared/services';
import type { Request, Response } from 'express';

import { prisma } from '../db';
import { resolveStreamerId } from './auth';
import { runWithFallback } from './llm/chain';
import type { PendingCard } from './llm/types';
import { SYSTEM_PROMPT } from './prompt';
import { AGENT_TOOLS, runTool } from './tools';

/**
 * 에이전트 채팅 SSE (#35). POST { conversationId, message } → text/tool/done/error 이벤트.
 * LLM 호출은 프로바이더 폴백 체인(llm/chain)이 담당한다. 대화는 매 단계 DB 에 저장하고,
 * 턴 사이 히스토리는 텍스트만 다시 보낸다(llm/types 참고 — 토큰 절감·프로바이더 호환).
 */

const MAX_ITERATIONS = 8;
/** 오래된 대화는 뒤쪽만 보낸다 — 전체 기록은 DB·화면에 그대로 남는다 */
const MAX_HISTORY_TURNS = 30;
const MAX_MESSAGE_CHARS = 4000;

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** DB 메시지(블록) → 텍스트만 — 턴 간 히스토리용 */
function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as { type?: string; text?: string }[])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n');
}

export async function agentChatHandler(req: Request, res: Response) {
  const userId = await resolveStreamerId(req);
  if (!userId) {
    res.status(401).json({ message: '로그인이 필요합니다.' });
    return;
  }

  const body = req.body as { conversationId?: unknown; message?: unknown } | undefined;
  const conversationId = Number(body?.conversationId);
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_CHARS) : '';
  if (!Number.isInteger(conversationId) || conversationId <= 0 || !message) {
    res.status(400).json({ message: '잘못된 요청입니다.' });
    return;
  }

  let providers;
  let settings;
  let conversation;
  try {
    ({ providers, settings } = await agentService.assertAvailable(prisma, userId));
    conversation = await agentService.getConversation(prisma, userId, conversationId);
  } catch (error) {
    if (isServiceError(error)) {
      res.status(error.code === 'NOT_FOUND' ? 404 : 403).json({ message: error.message });
      return;
    }
    throw error;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  const history = conversation.messages
    .map((row) => ({ role: row.role as 'user' | 'assistant', text: textOf(row.content) }))
    .filter((turn) => turn.text)
    .slice(-MAX_HISTORY_TURNS);

  await agentService.appendMessage(prisma, conversationId, 'user', [{ type: 'text', text: message }]);
  await agentService.setTitleFromFirstMessage(prisma, conversationId, message);

  try {
    const { outcome, served } = await runWithFallback(prisma, providers, {
      system: SYSTEM_PROMPT,
      tools: AGENT_TOOLS,
      history,
      userText: message,
      webSearch: settings.webSearchEnabled,
      maxIterations: MAX_ITERATIONS,
      signal: abort.signal,
      onText: (delta) => sseSend(res, 'text', { delta }),
      onToolStart: (name) => sseSend(res, 'tool', { name }),
      runTool: async (name, input) => {
        try {
          return await runTool(prisma, userId, conversationId, name, input);
        } catch (error) {
          //  카드 생성 실패 포함 — 사용자를 귀찮게 하지 말고 모델에게 돌려준다 (pelican 과 동일)
          return {
            content: isServiceError(error) ? error.message : '실행에 실패했습니다.',
            isError: true,
          };
        }
      },
    });

    for (const recordMessage of outcome.record) {
      await agentService.appendMessage(
        prisma, conversationId, recordMessage.role, recordMessage.content as unknown as Prisma.InputJsonValue,
      );
    }
    //  확인 카드로 멈췄다 — 대기 액션을 만들어 카드 이벤트를 보낸다. 실행은 승인 mutation 만 할 수 있다
    if (outcome.pending) {
      const action = await agentService.createPendingAction(prisma, {
        conversationId,
        providerId: served.id,
        toolUseId: outcome.pending.toolUseId,
        tool: outcome.pending.tool,
        input: outcome.pending.input as Prisma.InputJsonValue,
        card: outcome.pending.card as unknown as Prisma.InputJsonValue,
        native: outcome.pending.native as Prisma.InputJsonValue,
      });
      sseSend(res, 'confirm', {
        actionId: action.id,
        toolUseId: outcome.pending.toolUseId,
        tool: outcome.pending.tool,
        card: outcome.pending.card satisfies PendingCard,
      });
    }
    if (outcome.usage.inputTokens + outcome.usage.outputTokens > 0) {
      await agentService
        .recordUsage(prisma, {
          userId,
          conversationId,
          provider: served.kind,
          entryName: served.name,
          model: served.model,
          ...outcome.usage,
        })
        .catch(() => {});
    }
    sseSend(res, 'done', { ...outcome.usage, provider: served.name });
  } catch (error) {
    if (!abort.signal.aborted) {
      // eslint-disable-next-line no-console
      console.error('[agent] 대화 실패:', error);
      sseSend(res, 'error', { message: '응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  } finally {
    res.end();
  }
}
