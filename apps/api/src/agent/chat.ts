import Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { agentService, isServiceError } from '@wizbot/shared/services';
import type { Request, Response } from 'express';

import { prisma } from '../db';
import { resolveStreamerId } from './auth';
import { SYSTEM_PROMPT } from './prompt';
import { AGENT_TOOLS, runTool } from './tools';

/**
 * 에이전트 채팅 SSE (#35). POST { conversationId, message } → text/tool/done/error 이벤트.
 * 대화는 매 단계 DB 에 저장한다 — replica 어디로 붙어도 이어지고, 중간에 끊겨도 기록이 남는다.
 */

const MAX_ITERATIONS = 8;
/** 오래된 대화는 뒤쪽만 보낸다 — 토큰 절약. 전체 기록은 DB·화면에 그대로 남는다 */
const MAX_HISTORY_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
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

  let settings;
  let conversation;
  try {
    settings = await agentService.assertAvailable(prisma, userId);
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

  const history = conversation.messages.slice(-MAX_HISTORY_MESSAGES).map(
    (row) => ({ role: row.role, content: row.content }) as Anthropic.MessageParam,
  );
  const messages: Anthropic.MessageParam[] = [...history, { role: 'user', content: [{ type: 'text', text: message }] }];

  await agentService.appendMessage(prisma, conversationId, 'user', [{ type: 'text', text: message }]);
  await agentService.setTitleFromFirstMessage(prisma, conversationId, message);

  const client = new Anthropic({ apiKey: settings.apiKey });
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const stream = client.messages.stream(
        {
          model: settings.model,
          max_tokens: 8192,
          //  시스템+tool 은 고정 — prompt caching 적중을 위해 (변하는 값 금지)
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          tools: AGENT_TOOLS,
          messages,
        },
        { signal: abort.signal },
      );
      stream.on('text', (delta) => sseSend(res, 'text', { delta }));
      const response = await stream.finalMessage();

      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;

      messages.push({ role: 'assistant', content: response.content });
      await agentService.appendMessage(
        prisma, conversationId, 'assistant', response.content as unknown as Prisma.InputJsonValue,
      );

      if (response.stop_reason === 'pause_turn') continue;
      if (response.stop_reason !== 'tool_use') break;

      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        sseSend(res, 'tool', { name: toolUse.name });
        try {
          const content = await runTool(prisma, userId, toolUse.name, toolUse.input as Record<string, unknown>);
          results.push({ type: 'tool_result', tool_use_id: toolUse.id, content });
        } catch (error) {
          results.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: isServiceError(error) ? error.message : '조회에 실패했습니다.',
            is_error: true,
          });
        }
      }
      messages.push({ role: 'user', content: results });
      await agentService.appendMessage(prisma, conversationId, 'user', results as unknown as Prisma.InputJsonValue);
    }
    sseSend(res, 'done', usage);
  } catch (error) {
    if (!abort.signal.aborted) {
      // eslint-disable-next-line no-console
      console.error('[agent] 대화 실패:', error);
      sseSend(res, 'error', { message: '응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    }
  } finally {
    if (usage.inputTokens + usage.outputTokens > 0) {
      await agentService
        .recordUsage(prisma, { userId, conversationId, model: settings.model, ...usage })
        .catch(() => {});
    }
    res.end();
  }
}
