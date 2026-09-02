import type { Prisma } from '@prisma/client';
import { agentService, isServiceError } from '@wizbot/shared/services';
import type { Request, Response } from 'express';

import { prisma } from '../db';
import { resolveStreamerId } from './auth';
import { resumePendingTurn } from './llm/chain';
import { type PendingCard,ProviderApiError } from './llm/types';
import { SYSTEM_PROMPT } from './prompt';
import { AGENT_TOOLS, executeConfirmed, runTool } from './tools';

/**
 * 승인 카드 응답 (#35, pelican 재개 플로우). POST { actionId, approve } → SSE.
 * 승인이면 tool 을 실행하고, 멈췄던 턴을 같은 프로바이더로 이어 돌려 모델이 결과를 서술한다.
 * 실행 경로가 여기뿐이므로 모델이 뭐라 하든 사용자 클릭 없이는 아무것도 지워지지 않는다.
 */

function sseSend(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function agentResumeHandler(req: Request, res: Response) {
  const userId = await resolveStreamerId(req);
  if (!userId) {
    res.status(401).json({ message: '로그인이 필요합니다.' });
    return;
  }

  const body = req.body as { actionId?: unknown; approve?: unknown } | undefined;
  const actionId = Number(body?.actionId);
  const approve = body?.approve === true;
  if (!Number.isInteger(actionId) || actionId <= 0) {
    res.status(400).json({ message: '잘못된 요청입니다.' });
    return;
  }

  let action;
  let provider;
  try {
    const settings = await agentService.getSettings(prisma);
    if (!settings.enabled) throw Object.assign(new Error('에이전트가 꺼져 있습니다.'), { statusCode: 403 });
    action = await agentService.getPendingAction(prisma, userId, actionId);
    provider = await prisma.agentProvider.findUnique({ where: { id: action.providerId } });
    if (!provider) {
      throw Object.assign(new Error('이 작업을 만든 모델 항목이 삭제되어 이어갈 수 없습니다. 다시 요청해주세요.'), { statusCode: 409 });
    }
    const limit = await agentService.checkLimits(prisma, userId);
    if (approve && limit.blocked) throw Object.assign(new Error(limit.message), { statusCode: 403 });
    //  원자적 선점 — 더블클릭·동시 요청이 두 번 실행되지 않는다
    await agentService.claimPendingAction(prisma, actionId, approve ? 'APPROVED' : 'DECLINED');
  } catch (error) {
    if (isServiceError(error)) {
      res.status(error.code === 'NOT_FOUND' ? 404 : 409).json({ message: error.message });
      return;
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status) {
      res.status(status).json({ message: (error as Error).message });
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

  const conversationId = action.conversationId;
  const toolInput = action.input as Record<string, unknown>;

  //  승인 → 실제 실행 (감사 기록 포함). 거절 → 실행 없이 모델에게 알린다
  let resolvedContent: string;
  let resolvedIsError = false;
  if (approve) {
    try {
      const executed = await executeConfirmed(prisma, userId, conversationId, action.tool, toolInput);
      resolvedContent = executed.content;
      resolvedIsError = executed.isError;
    } catch (error) {
      resolvedContent = isServiceError(error) ? error.message : '실행에 실패했습니다.';
      resolvedIsError = true;
    }
  } else {
    resolvedContent = 'The user declined this action on the confirmation card. Do not retry it unless they ask again.';
  }

  const settings = await agentService.getSettings(prisma);
  const usageTotal = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  try {
    const outcome = await resumePendingTurn(
      provider,
      action.native,
      { toolUseId: action.toolUseId, content: resolvedContent, isError: resolvedIsError },
      {
        system: SYSTEM_PROMPT,
        tools: AGENT_TOOLS,
        history: [],
        userText: '',
        webSearch: settings.webSearchEnabled,
        maxIterations: 8,
        signal: abort.signal,
        onText: (delta) => sseSend(res, 'text', { delta }),
        onToolStart: (name) => sseSend(res, 'tool', { name }),
        runTool: async (name, input) => {
          try {
            return await runTool(prisma, userId, conversationId, name, input);
          } catch (error) {
            return { content: isServiceError(error) ? error.message : '실행에 실패했습니다.', isError: true };
          }
        },
      },
    );

    usageTotal.inputTokens += outcome.usage.inputTokens;
    usageTotal.outputTokens += outcome.usage.outputTokens;
    usageTotal.cacheReadTokens += outcome.usage.cacheReadTokens;

    for (const recordMessage of outcome.record) {
      await agentService.appendMessage(
        prisma, conversationId, recordMessage.role, recordMessage.content as unknown as Prisma.InputJsonValue,
      );
    }
    //  재개 중 또 카드가 나올 수 있다 (남은 큐에 확인 대상이 더 있던 경우)
    if (outcome.pending) {
      const next = await agentService.createPendingAction(prisma, {
        conversationId,
        providerId: provider.id,
        toolUseId: outcome.pending.toolUseId,
        tool: outcome.pending.tool,
        input: outcome.pending.input as Prisma.InputJsonValue,
        card: outcome.pending.card as unknown as Prisma.InputJsonValue,
        native: outcome.pending.native as Prisma.InputJsonValue,
      });
      sseSend(res, 'confirm', {
        actionId: next.id,
        toolUseId: outcome.pending.toolUseId,
        tool: outcome.pending.tool,
        card: outcome.pending.card satisfies PendingCard,
      });
    }
    if (usageTotal.inputTokens + usageTotal.outputTokens > 0) {
      await agentService
        .recordUsage(prisma, {
          userId, conversationId,
          provider: provider.kind, entryName: provider.name, model: provider.model,
          ...usageTotal,
        })
        .catch(() => {});
    }
    sseSend(res, 'done', { ...usageTotal, provider: provider.name });
  } catch (error) {
    if (!abort.signal.aborted) {
      // eslint-disable-next-line no-console
      console.error('[agent] 재개 실패:', error);
      //  실행 자체는 이미 끝났다 — 서술만 실패한 것. 실행 결과를 잃지 않도록 기록해 둔다
      await agentService
        .appendMessage(prisma, conversationId, 'user', [
          { type: 'tool_result', tool_use_id: action.toolUseId, content: resolvedContent, ...(resolvedIsError ? { is_error: true } : {}) },
        ] as unknown as Prisma.InputJsonValue)
        .catch(() => {});
      const message =
        error instanceof ProviderApiError
          ? '작업은 처리됐지만 응답 생성에 실패했습니다. 대화를 이어서 확인해주세요.'
          : '응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.';
      sseSend(res, 'error', { message });
    }
  } finally {
    res.end();
  }
}
