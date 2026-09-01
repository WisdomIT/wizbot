import type { Prisma, PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

/**
 * 설정 도우미 에이전트 (#35). 설정(API 키·모델·한도)은 DB 로 관리하고,
 * 대화는 replica 어디서든 이어지도록 DB 에 저장한다. 실제 Claude 호출 루프는
 * apps/api 쪽(agent 핸들러)에 있다 — SDK 의존을 shared 에 넣지 않기 위해서다.
 */

export const AGENT_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

/** API 키는 비밀값 — 화면에는 끝 4자만 */
export function maskApiKey(key: string): string {
  return `…${key.slice(-4)}`;
}

/** api 내부용 — 키 원문 포함. 라우터로 내보내지 말 것 */
export function getSettings(prisma: PrismaClient) {
  return prisma.agentSettings.findUnique({ where: { id: 1 } });
}

/** 어드민 화면용 — 키는 끝 4자만 */
export async function getSettingsMasked(prisma: PrismaClient) {
  const row = await getSettings(prisma);
  return {
    configured: !!row,
    enabled: row?.enabled ?? false,
    model: row?.model ?? AGENT_MODELS[0],
    dailyTokenLimit: row?.dailyTokenLimit ?? 500000,
    maskedKey: row ? maskApiKey(row.apiKey) : null,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function setSettings(
  prisma: PrismaClient,
  input: { apiKey: string; model: string; dailyTokenLimit: number; enabled: boolean },
) {
  if (!(AGENT_MODELS as readonly string[]).includes(input.model)) {
    throw new ServiceError('INVALID_INPUT', '지원하지 않는 모델입니다.');
  }
  const existing = await getSettings(prisma);
  //  키를 비워 두면 저장된 값을 유지한다 (모델·한도만 바꿀 때 재입력 불필요)
  const apiKey = input.apiKey.trim() || existing?.apiKey;
  if (!apiKey) throw new ServiceError('INVALID_INPUT', 'Anthropic API 키를 입력해주세요.');
  if (!apiKey.startsWith('sk-ant-')) throw new ServiceError('INVALID_INPUT', 'Anthropic API 키 형식이 아닙니다. (sk-ant-…)');
  const data = { apiKey, model: input.model, dailyTokenLimit: input.dailyTokenLimit, enabled: input.enabled };
  await prisma.agentSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}

/** 켜져 있고 키가 있고 오늘 한도가 남았는지 — 채팅 시작 전 확인. 통과하면 설정 원문을 돌려준다 */
export async function assertAvailable(prisma: PrismaClient, userId: number) {
  const settings = await getSettings(prisma);
  if (!settings?.enabled) throw new ServiceError('FORBIDDEN', '도우미가 꺼져 있습니다. 운영자에게 문의해주세요.');
  const used = await dailyTokensUsed(prisma, userId);
  if (used >= settings.dailyTokenLimit) {
    throw new ServiceError('FORBIDDEN', '오늘 사용량 한도에 도달했습니다. 내일 다시 이용할 수 있습니다.');
  }
  return settings;
}

/** 오늘(서버 기준) 쓴 토큰 합 — input + output */
export async function dailyTokensUsed(prisma: PrismaClient, userId: number) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sum = await prisma.agentUsage.aggregate({
    where: { userId, createdAt: { gte: startOfDay } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0);
}

export function recordUsage(
  prisma: PrismaClient,
  input: { userId: number; conversationId: number | null; model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number },
) {
  return prisma.agentUsage.create({ data: input });
}

/* ── 대화 (스트리머 스코프) ── */

export function listConversations(prisma: PrismaClient, userId: number) {
  return prisma.agentConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getConversation(prisma: PrismaClient, userId: number, id: number) {
  const conversation = await prisma.agentConversation.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { id: 'asc' } } },
  });
  if (!conversation) throw new ServiceError('NOT_FOUND', '대화를 찾을 수 없습니다.');
  return conversation;
}

export function createConversation(prisma: PrismaClient, userId: number) {
  return prisma.agentConversation.create({ data: { userId }, select: { id: true, title: true, updatedAt: true } });
}

export async function removeConversation(prisma: PrismaClient, userId: number, id: number) {
  const removed = await prisma.agentConversation.deleteMany({ where: { id, userId } });
  if (removed.count === 0) throw new ServiceError('NOT_FOUND', '대화를 찾을 수 없습니다.');
}

export function appendMessage(
  prisma: PrismaClient,
  conversationId: number,
  role: 'user' | 'assistant',
  content: Prisma.InputJsonValue,
) {
  return prisma.$transaction([
    prisma.agentMessage.create({ data: { conversationId, role, content } }),
    //  대화 목록 정렬용 — 메시지가 붙으면 대화가 위로 온다
    prisma.agentConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
  ]);
}

/** 첫 메시지로 제목 자동 지정 — 기본 제목일 때만 */
export async function setTitleFromFirstMessage(prisma: PrismaClient, conversationId: number, text: string) {
  const title = text.replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!title) return;
  await prisma.agentConversation.updateMany({
    where: { id: conversationId, title: '새 대화' },
    data: { title },
  });
}
