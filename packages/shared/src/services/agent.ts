import type { AgentLimitMetric, AgentLimitPeriod, AgentLimitScope, AgentProviderKind, Prisma, PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

/**
 * 설정 도우미 에이전트 (#35). pelican-concierge 구조를 따른다 —
 * 프로바이더는 순서 있는 목록(#89), 한도는 기준×범위×주기 규칙 목록(#4).
 * 실제 LLM 호출(어댑터·폴백 체인)은 apps/api 쪽에 있다.
 */

/** 프로바이더별 능력 — 설정 화면이 이걸 보고 폼을 바꾼다 (지원 안 하는 건 화면에서 꺼져 있어야 한다) */
export const AGENT_PROVIDER_CAPS: Record<AgentProviderKind, { label: string; webSearch: boolean; needsBaseUrl: boolean; needsKey: boolean }> = {
  ANTHROPIC: { label: 'Anthropic (Claude)', webSearch: true, needsBaseUrl: false, needsKey: true },
  OPENAI: { label: 'OpenAI (ChatGPT)', webSearch: true, needsBaseUrl: false, needsKey: true },
  GEMINI: { label: 'Google (Gemini)', webSearch: true, needsBaseUrl: false, needsKey: true },
  OPENAI_COMPAT: { label: 'OpenAI 호환 (로컬 LLM)', webSearch: false, needsBaseUrl: true, needsKey: false },
};

const maskKey = (key: string) => (key ? `…${key.slice(-4)}` : null);

/* ── 전역 설정 ── */

export async function getSettings(prisma: PrismaClient) {
  const row = await prisma.agentSettings.findUnique({ where: { id: 1 } });
  return { enabled: row?.enabled ?? false, webSearchEnabled: row?.webSearchEnabled ?? false };
}

export async function setSettings(prisma: PrismaClient, input: { enabled: boolean; webSearchEnabled: boolean }) {
  await prisma.agentSettings.upsert({ where: { id: 1 }, update: input, create: { id: 1, ...input } });
}

/* ── 프로바이더 목록 (#89) ── */

/** api 내부용 — 키 원문 포함, 켜진 것만 우선순위대로 */
export function listActiveProviders(prisma: PrismaClient) {
  return prisma.agentProvider.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } });
}

/** 어드민 화면용 — 키는 끝 4자만 */
export async function listProvidersMasked(prisma: PrismaClient) {
  const rows = await prisma.agentProvider.findMany({ orderBy: { priority: 'asc' } });
  return rows.map((row) => ({
    id: row.id,
    priority: row.priority,
    name: row.name,
    kind: row.kind,
    maskedKey: maskKey(row.apiKey),
    baseUrl: row.baseUrl,
    model: row.model,
    enabled: row.enabled,
  }));
}

function validateProviderInput(kind: AgentProviderKind, input: { name: string; apiKey: string; baseUrl: string | null; model: string }, existingKey?: string) {
  const caps = AGENT_PROVIDER_CAPS[kind];
  if (!input.name.trim()) throw new ServiceError('INVALID_INPUT', '표시명을 입력해주세요.');
  if (!input.model.trim()) throw new ServiceError('INVALID_INPUT', '모델명을 입력해주세요.');
  if (caps.needsBaseUrl && !input.baseUrl?.trim()) throw new ServiceError('INVALID_INPUT', '엔드포인트 주소(base URL)를 입력해주세요.');
  if (caps.needsKey && !input.apiKey.trim() && !existingKey) throw new ServiceError('INVALID_INPUT', 'API 키를 입력해주세요.');
}

export async function createProvider(
  prisma: PrismaClient,
  input: { name: string; kind: AgentProviderKind; apiKey: string; baseUrl: string | null; model: string },
) {
  validateProviderInput(input.kind, input);
  const last = await prisma.agentProvider.findFirst({ orderBy: { priority: 'desc' } });
  await prisma.agentProvider.create({
    data: {
      priority: (last?.priority ?? 0) + 1,
      name: input.name.trim(),
      kind: input.kind,
      apiKey: input.apiKey.trim(),
      baseUrl: input.baseUrl?.trim() || null,
      model: input.model.trim(),
    },
  });
}

export async function updateProvider(
  prisma: PrismaClient,
  id: number,
  input: { name: string; apiKey: string; baseUrl: string | null; model: string; enabled: boolean },
) {
  const existing = await prisma.agentProvider.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('NOT_FOUND', '프로바이더를 찾을 수 없습니다.');
  validateProviderInput(existing.kind, input, existing.apiKey);
  await prisma.agentProvider.update({
    where: { id },
    data: {
      name: input.name.trim(),
      //  키를 비워 두면 저장된 값 유지 (모델만 바꿀 때 재입력 불필요)
      apiKey: input.apiKey.trim() || existing.apiKey,
      baseUrl: input.baseUrl?.trim() || null,
      model: input.model.trim(),
      enabled: input.enabled,
    },
  });
}

export async function deleteProvider(prisma: PrismaClient, id: number) {
  const removed = await prisma.agentProvider.deleteMany({ where: { id } });
  if (removed.count === 0) throw new ServiceError('NOT_FOUND', '프로바이더를 찾을 수 없습니다.');
}

/** 우선순위 한 칸 이동 — 이웃과 priority 를 맞바꾼다 */
export async function moveProvider(prisma: PrismaClient, id: number, direction: 'up' | 'down') {
  const target = await prisma.agentProvider.findUnique({ where: { id } });
  if (!target) throw new ServiceError('NOT_FOUND', '프로바이더를 찾을 수 없습니다.');
  const neighbor = await prisma.agentProvider.findFirst({
    where: direction === 'up' ? { priority: { lt: target.priority } } : { priority: { gt: target.priority } },
    orderBy: { priority: direction === 'up' ? 'desc' : 'asc' },
  });
  if (!neighbor) return;
  await prisma.$transaction([
    prisma.agentProvider.update({ where: { id: target.id }, data: { priority: neighbor.priority } }),
    prisma.agentProvider.update({ where: { id: neighbor.id }, data: { priority: target.priority } }),
  ]);
}

/* ── 한도 규칙 (#4: 기준 × 범위 × 주기) ── */

export function listLimits(prisma: PrismaClient) {
  return prisma.agentLimit.findMany({ orderBy: { id: 'asc' } });
}

export async function addLimit(
  prisma: PrismaClient,
  input: { metric: AgentLimitMetric; scope: AgentLimitScope; period: AgentLimitPeriod; amount: number },
) {
  if (input.amount <= 0) throw new ServiceError('INVALID_INPUT', '한도 값은 1 이상이어야 합니다.');
  await prisma.agentLimit.create({ data: input });
}

export async function removeLimit(prisma: PrismaClient, id: number) {
  const removed = await prisma.agentLimit.deleteMany({ where: { id } });
  if (removed.count === 0) throw new ServiceError('NOT_FOUND', '규칙을 찾을 수 없습니다.');
}

const PERIOD_MS: Record<AgentLimitPeriod, number> = {
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000,
};

const PERIOD_LABEL: Record<AgentLimitPeriod, string> = { HOUR: '시간', DAY: '일', WEEK: '주', MONTH: '월' };

/**
 * 모든 규칙을 검사한다(AND) — 하나라도 초과하면 차단. rolling window 로 계산한다.
 * GLOBAL 규칙 초과는 서비스 전체 차단이다.
 */
export async function checkLimits(prisma: PrismaClient, userId: number): Promise<{ blocked: false } | { blocked: true; message: string }> {
  const limits = await listLimits(prisma);
  for (const limit of limits) {
    const since = new Date(Date.now() - PERIOD_MS[limit.period]);
    const where = { createdAt: { gte: since }, ...(limit.scope === 'STREAMER' ? { userId } : {}) };
    const used =
      limit.metric === 'MESSAGES'
        ? await prisma.agentUsage.count({ where })
        : await prisma.agentUsage
            .aggregate({ where, _sum: { inputTokens: true, outputTokens: true } })
            .then((sum) => (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0));
    if (used >= limit.amount) {
      const scopeText = limit.scope === 'GLOBAL' ? '서비스 전체' : '스트리머';
      const metricText = limit.metric === 'MESSAGES' ? '채팅 수' : '토큰';
      return {
        blocked: true,
        message: `사용량 한도에 도달했습니다 (${scopeText} · ${PERIOD_LABEL[limit.period]} ${metricText} ${limit.amount.toLocaleString('ko-KR')}). 잠시 후 다시 이용할 수 있습니다.`,
      };
    }
  }
  return { blocked: false };
}

/** 채팅 시작 전 확인 — 켜짐 + 프로바이더 존재 + 한도. 통과하면 켜진 프로바이더 목록(키 원문)을 돌려준다 */
export async function assertAvailable(prisma: PrismaClient, userId: number) {
  const settings = await getSettings(prisma);
  if (!settings.enabled) throw new ServiceError('FORBIDDEN', '도우미가 꺼져 있습니다. 운영자에게 문의해주세요.');
  const providers = await listActiveProviders(prisma);
  if (providers.length === 0) throw new ServiceError('FORBIDDEN', '사용할 수 있는 모델이 없습니다. 운영자에게 문의해주세요.');
  const limit = await checkLimits(prisma, userId);
  if (limit.blocked) throw new ServiceError('FORBIDDEN', limit.message);
  return { settings, providers };
}

export function recordUsage(
  prisma: PrismaClient,
  input: {
    userId: number; conversationId: number | null;
    provider: string; entryName: string | null; model: string;
    inputTokens: number; outputTokens: number; cacheReadTokens: number;
  },
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
