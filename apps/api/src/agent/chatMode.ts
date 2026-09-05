/* eslint-disable no-console */
import type { Prisma } from '@prisma/client';
import { type AgentChatMode,clampChatMessage, splitForChat } from '@wizbot/shared/chatbot';
import { agentService, getChzzkClientForUser, isServiceError } from '@wizbot/shared/services';

import { prisma } from '../db';
import { resumePendingTurn, runWithFallback } from './llm/chain';
import type { PendingCard, RecordMessage, TurnUsage } from './llm/types';
import { SYSTEM_PROMPT } from './prompt';
import { AGENT_TOOLS, executeConfirmed, runTool } from './tools';

/**
 * 채팅 에이전트 (#238) — `!에이전트` 로 열리는 60초 파싱 창.
 * 콘솔 패널과 같은 대화(AgentConversation)·tool·한도·감사 경로를 쓰되,
 * 응답은 스트리밍 대신 모아서 치지직 채팅(100자 단위 최대 3건)으로 보낸다.
 * API replicas=1 전제로 창 상태는 메모리에 둔다 (재시작 시 창만 사라진다 — 60초짜리라 무해).
 */

const WINDOW_MS = 60_000;
const USAGE_WARN_RATIO = 0.8;
const MAX_HISTORY_TURNS = 30;
const TURN_TIMEOUT_MS = 120_000;

interface ChatSession {
  conversationId: number;
  timer: NodeJS.Timeout;
  warned: boolean;
  busy: boolean;
  /** 처리 중 들어온 다음 요청 — 최신 1건만 보관 */
  queued: string | null;
  pendingActionId: number | null;
}

const sessions = new Map<number, ChatSession>();

async function sendChat(userId: number, text: string) {
  try {
    await getChzzkClientForUser(prisma, userId).chats.send(clampChatMessage(text));
  } catch (error) {
    console.error('[agent-chat] 채팅 전송 실패:', userId, error);
  }
}

async function sendChatParts(userId: number, text: string) {
  for (const part of splitForChat(text)) await sendChat(userId, part);
}

function refreshWindow(userId: number, session: ChatSession) {
  clearTimeout(session.timer);
  session.timer = setTimeout(() => {
    sessions.delete(userId);
    void sendChat(userId, '에이전트 이용을 마쳤습니다. 다시 부르려면 !에이전트 를 입력해주세요.');
  }, WINDOW_MS);
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return (content as { type?: string; text?: string }[])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n');
}

/** 채팅 모드 프롬프트 — 100자 제한 매체에 맞게. 카드 클릭이 없으므로 승인/거절 채팅 규칙 안내 */
const CHAT_SUFFIX = `

## Chat mode (this conversation happens in live Chzzk chat)
Replies are posted as chat messages with a hard 100-character limit each, at most 3 messages per turn. Be extremely brief — one or two short sentences, plain text only: no markdown, no tables, no headings. For anything long, point to the console menu or a /manual page path instead of explaining in chat. Confirmation cards cannot be clicked here; when one appears the system asks the user to reply 승인 or 거절 — do not ask again yourself.`;

async function ensureSession(userId: number): Promise<ChatSession> {
  const existing = sessions.get(userId);
  if (existing) {
    refreshWindow(userId, existing);
    return existing;
  }
  const conversation = await agentService.createConversation(prisma, userId);
  const session: ChatSession = {
    conversationId: conversation.id,
    timer: setTimeout(() => {}, 0),
    warned: false,
    busy: false,
    queued: null,
    pendingActionId: null,
  };
  sessions.set(userId, session);
  refreshWindow(userId, session);
  return session;
}

async function processTurn(userId: number, session: ChatSession, text: string): Promise<void> {
  session.busy = true;
  try {
    let providers;
    let settings;
    try {
      ({ providers, settings } = await agentService.assertAvailable(prisma, userId));
    } catch (error) {
      await sendChat(userId, isServiceError(error) ? error.message : '에이전트를 사용할 수 없습니다.');
      return;
    }

    const conversation = await agentService.getConversation(prisma, userId, session.conversationId);
    const history = conversation.messages
      .map((row) => ({ role: row.role as 'user' | 'assistant', text: textOf(row.content) }))
      .filter((turn) => turn.text)
      .slice(-MAX_HISTORY_TURNS);

    await agentService.appendMessage(prisma, session.conversationId, 'user', [{ type: 'text', text }]);
    await agentService.setTitleFromFirstMessage(prisma, session.conversationId, `[채팅] ${text}`);

    let buffer = '';
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS);
    try {
      const { outcome, served } = await runWithFallback(prisma, providers, {
        system: SYSTEM_PROMPT + CHAT_SUFFIX,
        tools: AGENT_TOOLS,
        history,
        userText: text,
        webSearch: settings.webSearchEnabled,
        maxIterations: 8,
        signal: abort.signal,
        onText: (delta) => {
          buffer += delta;
        },
        onToolStart: () => {},
        runTool: async (name, input) => {
          try {
            return await runTool(prisma, userId, session.conversationId, name, input);
          } catch (error) {
            return { content: isServiceError(error) ? error.message : '실행에 실패했습니다.', isError: true };
          }
        },
      });
      await persistOutcome(userId, session, outcome.record, outcome.usage, served.kind, served.name, served.model);

      if (outcome.pending) {
        const action = await agentService.createPendingAction(prisma, {
          conversationId: session.conversationId,
          providerId: served.id,
          toolUseId: outcome.pending.toolUseId,
          tool: outcome.pending.tool,
          input: outcome.pending.input as Prisma.InputJsonValue,
          card: outcome.pending.card as unknown as Prisma.InputJsonValue,
          native: outcome.pending.native as Prisma.InputJsonValue,
        });
        session.pendingActionId = action.id;
        const card = outcome.pending.card satisfies PendingCard;
        await sendChat(userId, clampChatMessage(`⚠ ${card.title} — 진행하려면 "승인", 취소는 "거절"로 답해주세요.`));
      }
      if (buffer.trim()) await sendChatParts(userId, buffer);
      else if (!outcome.pending) await sendChat(userId, '처리했습니다.');
      await warnIfNearLimit(userId, session);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error('[agent-chat] 처리 실패:', userId, error);
    await sendChat(userId, '응답 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
  } finally {
    session.busy = false;
    if (sessions.get(userId) === session) refreshWindow(userId, session);
    const next = session.queued;
    session.queued = null;
    if (next) void processTurn(userId, session, next);
  }
}

async function persistOutcome(
  userId: number,
  session: ChatSession,
  record: RecordMessage[],
  usage: TurnUsage,
  provider: string,
  entryName: string,
  model: string,
) {
  let lastAssistantMessageId: number | null = null;
  for (const message of record) {
    const [created] = await agentService.appendMessage(
      prisma, session.conversationId, message.role, message.content as unknown as Prisma.InputJsonValue,
    );
    if (message.role === 'assistant') lastAssistantMessageId = created.id;
  }
  if (usage.inputTokens + usage.outputTokens > 0) {
    await agentService
      .recordUsage(prisma, {
        userId,
        conversationId: session.conversationId,
        messageId: lastAssistantMessageId,
        provider,
        entryName,
        model,
        ...usage,
      })
      .catch(() => {});
  }
}

async function warnIfNearLimit(userId: number, session: ChatSession) {
  if (session.warned) return;
  const ratio = await agentService.usageRatio(prisma, userId).catch(() => 0);
  if (ratio >= USAGE_WARN_RATIO) {
    session.warned = true;
    await sendChat(userId, `에이전트 사용량이 한도의 ${Math.floor(ratio * 100)}%에 도달했습니다.`);
  }
}

/** 채팅 "승인"/"거절" — 콘솔 카드의 클릭과 같은 경로(선점→실행→턴 재개)를 탄다 */
async function resolveFromChat(userId: number, session: ChatSession, approve: boolean): Promise<void> {
  const actionId = session.pendingActionId;
  session.pendingActionId = null;
  if (!actionId) return;
  session.busy = true;
  try {
    const action = await agentService.getPendingAction(prisma, userId, actionId);
    const provider = await prisma.agentProvider.findUnique({ where: { id: action.providerId } });
    if (!provider) {
      await sendChat(userId, '이 작업을 만든 모델 항목이 삭제되어 이어갈 수 없습니다.');
      return;
    }
    await agentService.claimPendingAction(prisma, actionId, approve ? 'APPROVED' : 'DECLINED');

    let content: string;
    let isError = false;
    if (approve) {
      const executed = await executeConfirmed(prisma, userId, session.conversationId, action.tool, action.input as Record<string, unknown>);
      content = executed.content;
      isError = executed.isError;
    } else {
      content = 'The user declined this action on the confirmation card. Do not retry it unless they ask again.';
    }

    const settings = await agentService.getSettings(prisma);
    let buffer = '';
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS);
    try {
      const outcome = await resumePendingTurn(provider, action.native, { toolUseId: action.toolUseId, content, isError }, {
        system: SYSTEM_PROMPT + CHAT_SUFFIX,
        tools: AGENT_TOOLS,
        history: [],
        userText: '',
        webSearch: settings.webSearchEnabled,
        maxIterations: 8,
        signal: abort.signal,
        onText: (delta) => {
          buffer += delta;
        },
        onToolStart: () => {},
        runTool: async (name, input) => {
          try {
            return await runTool(prisma, userId, session.conversationId, name, input);
          } catch (error) {
            return { content: isServiceError(error) ? error.message : '실행에 실패했습니다.', isError: true };
          }
        },
      });
      await persistOutcome(userId, session, outcome.record, outcome.usage, provider.kind, provider.name, provider.model);
      if (outcome.pending) {
        const next = await agentService.createPendingAction(prisma, {
          conversationId: session.conversationId,
          providerId: provider.id,
          toolUseId: outcome.pending.toolUseId,
          tool: outcome.pending.tool,
          input: outcome.pending.input as Prisma.InputJsonValue,
          card: outcome.pending.card as unknown as Prisma.InputJsonValue,
          native: outcome.pending.native as Prisma.InputJsonValue,
        });
        session.pendingActionId = next.id;
        await sendChat(userId, clampChatMessage(`⚠ ${outcome.pending.card.title} — "승인" 또는 "거절"로 답해주세요.`));
      }
      if (buffer.trim()) await sendChatParts(userId, buffer);
      await warnIfNearLimit(userId, session);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    if (isServiceError(error)) {
      await sendChat(userId, error.message);
    } else {
      console.error('[agent-chat] 승인 처리 실패:', userId, error);
      await sendChat(userId, '작업 처리에 실패했습니다. 콘솔에서 확인해주세요.');
    }
  } finally {
    session.busy = false;
    if (sessions.get(userId) === session) refreshWindow(userId, session);
  }
}

export const agentChatMode: AgentChatMode = {
  async start({ userId, request }) {
    try {
      await agentService.assertAvailable(prisma, userId);
    } catch (error) {
      return { ok: true, message: isServiceError(error) ? error.message : '에이전트를 사용할 수 없습니다.' };
    }
    const session = await ensureSession(userId);
    if (!request) {
      return { ok: true, message: '무엇을 도와드릴까요? 60초 안에 채팅으로 말씀해주세요.' };
    }
    if (session.busy) {
      session.queued = request;
      return { ok: true, message: '이전 요청을 처리 중입니다 — 끝나는 대로 이어서 처리할게요.' };
    }
    void processTurn(userId, session, request);
    return { ok: true, message: '요청을 확인하고 있습니다…' };
  },

  async relay({ userId, content }) {
    const session = sessions.get(userId);
    if (!session) return { active: false };
    refreshWindow(userId, session);
    const trimmed = content.trim();
    if (session.pendingActionId && /^(승인|거절)$/.test(trimmed)) {
      void resolveFromChat(userId, session, trimmed === '승인');
      return { active: true };
    }
    if (session.busy) {
      session.queued = trimmed;
      return { active: true };
    }
    void processTurn(userId, session, trimmed);
    return { active: true };
  },
};
