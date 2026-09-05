import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkLimits,
  claimPendingAction,
  getPendingAction,
  probeProvider,
  removeConversation,
} from '../agent';

afterEach(() => {
  vi.unstubAllGlobals();
});

/* ── 한도 규칙 (#35 조정 3) — 기준×범위×주기, 전부 AND ── */

type Limit = { metric: 'TOKENS' | 'MESSAGES'; scope: 'STREAMER' | 'GLOBAL'; period: 'HOUR' | 'DAY' | 'WEEK' | 'MONTH'; amount: number };

function limitsDb(limits: Limit[], usage: { count?: number; tokens?: number }) {
  return {
    agentLimit: { findMany: vi.fn().mockResolvedValue(limits.map((limit, id) => ({ id, ...limit }))) },
    agentUsage: {
      count: vi.fn().mockResolvedValue(usage.count ?? 0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { inputTokens: usage.tokens ?? 0, outputTokens: 0 } }),
    },
  } as unknown as PrismaClient;
}

describe('checkLimits', () => {
  it('규칙이 없으면 무제한', async () => {
    await expect(checkLimits(limitsDb([], {}), 1)).resolves.toEqual({ blocked: false });
  });

  it('스트리머당 채팅 수 초과 → 차단, 조회는 userId 로 좁힌다', async () => {
    const prisma = limitsDb([{ metric: 'MESSAGES', scope: 'STREAMER', period: 'DAY', amount: 5 }], { count: 5 });
    const result = await checkLimits(prisma, 7);
    expect(result.blocked).toBe(true);
    expect(prisma.agentUsage.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 7 }) }),
    );
  });

  it('전체(GLOBAL) 토큰 규칙은 userId 없이 집계하고, 초과 시 전체 차단 문구', async () => {
    const prisma = limitsDb([{ metric: 'TOKENS', scope: 'GLOBAL', period: 'WEEK', amount: 1000 }], { tokens: 1000 });
    const result = await checkLimits(prisma, 7);
    expect(result).toMatchObject({ blocked: true });
    if (result.blocked) expect(result.message).toContain('서비스 전체');
    const where = (prisma.agentUsage.aggregate as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(where.userId).toBeUndefined();
  });

  it('여러 규칙은 AND — 하나라도 초과하면 차단', async () => {
    const prisma = limitsDb(
      [
        { metric: 'MESSAGES', scope: 'STREAMER', period: 'DAY', amount: 100 }, // 여유
        { metric: 'TOKENS', scope: 'STREAMER', period: 'HOUR', amount: 10 }, // 초과
      ],
      { count: 1, tokens: 10 },
    );
    await expect(checkLimits(prisma, 1)).resolves.toMatchObject({ blocked: true });
  });
});

/* ── 프로바이더 probe (pelican ProviderProbe 이식) ── */

function fetchMock(status: number, body: unknown) {
  const mock = vi.fn().mockResolvedValue({ ok: status === 200, status, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const noStore = { agentProvider: { findUnique: vi.fn() } } as unknown as PrismaClient;

describe('probeProvider', () => {
  it('대화형이 아닌 모델(NOT_CHAT 부분일치)을 거른다', async () => {
    fetchMock(200, {
      data: [
        { id: 'gpt-6' },
        { id: 'text-embedding-3-large' },
        { id: 'whisper-1' },
        { id: 'gpt-realtime-preview' },
      ],
    });
    const { models } = await probeProvider(noStore, { kind: 'OPENAI', apiKey: 'sk-x', baseUrl: null, providerId: null });
    expect(models.map((model) => model.id)).toEqual(['gpt-6']);
  });

  it('Gemini: models/ 접두 제거 + supportedGenerationMethods 신호를 믿는다', async () => {
    fetchMock(200, {
      models: [
        { name: 'models/gemini-3-pro', displayName: 'Gemini 3 Pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-embed', supportedGenerationMethods: ['embedContent'] },
      ],
    });
    const { models } = await probeProvider(noStore, { kind: 'GEMINI', apiKey: 'k', baseUrl: null, providerId: null });
    expect(models).toEqual([{ id: 'gemini-3-pro', label: 'Gemini 3 Pro' }]);
  });

  it('잘못된 키: Gemini 는 400 도 키 오류로, OpenAI 의 400 은 HTTP 오류로 구분한다', async () => {
    fetchMock(400, {});
    await expect(probeProvider(noStore, { kind: 'GEMINI', apiKey: 'bad', baseUrl: null, providerId: null }))
      .rejects.toThrow('API 키가 올바르지 않습니다.');
    fetchMock(400, {});
    await expect(probeProvider(noStore, { kind: 'OPENAI', apiKey: 'bad', baseUrl: null, providerId: null }))
      .rejects.toThrow('HTTP 400');
    fetchMock(401, {});
    await expect(probeProvider(noStore, { kind: 'OPENAI', apiKey: 'bad', baseUrl: null, providerId: null }))
      .rejects.toThrow('API 키가 올바르지 않습니다.');
  });

  it('수정 폼에서 키를 비우면 저장된 키로 검사한다', async () => {
    const mock = fetchMock(200, { data: [] });
    const prisma = {
      agentProvider: { findUnique: vi.fn().mockResolvedValue({ id: 3, apiKey: 'sk-stored' }) },
    } as unknown as PrismaClient;
    await probeProvider(prisma, { kind: 'ANTHROPIC', apiKey: '', baseUrl: null, providerId: 3 });
    expect(mock.mock.calls[0][1].headers['x-api-key']).toBe('sk-stored');
  });

  it('로컬(OpenAI 호환)은 base URL 필수·목록은 정렬', async () => {
    await expect(probeProvider(noStore, { kind: 'OPENAI_COMPAT', apiKey: '', baseUrl: null, providerId: null }))
      .rejects.toThrow('base URL');
    fetchMock(200, { data: [{ id: 'zephyr' }, { id: 'llama-3.3' }] });
    const { models } = await probeProvider(noStore, { kind: 'OPENAI_COMPAT', apiKey: '', baseUrl: 'http://localhost:11434/v1', providerId: null });
    expect(models.map((model) => model.id)).toEqual(['llama-3.3', 'zephyr']);
  });
});

/* ── 승인 대기 액션 (#35 조정 2) — 실행 경로는 승인뿐, 이중 실행 불가 ── */

describe('대기 액션', () => {
  it('만료된 PENDING 은 EXPIRED 로 정리하며 거부한다', async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      agentPendingAction: {
        findFirst: vi.fn().mockResolvedValue({ id: 1, status: 'PENDING', expiresAt: new Date(Date.now() - 1000) }),
        update,
      },
    } as unknown as PrismaClient;
    await expect(getPendingAction(prisma, 1, 1)).rejects.toThrow('유효 시간');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'EXPIRED' }) }));
  });

  it('이미 처리된 액션은 거부한다', async () => {
    const prisma = {
      agentPendingAction: {
        findFirst: vi.fn().mockResolvedValue({ id: 1, status: 'APPROVED', expiresAt: new Date(Date.now() + 1000) }),
      },
    } as unknown as PrismaClient;
    await expect(getPendingAction(prisma, 1, 1)).rejects.toThrow('이미 처리된');
  });

  it('선점은 PENDING 일 때만 — 더블클릭의 두 번째는 실패한다', async () => {
    const prisma = {
      agentPendingAction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaClient;
    await expect(claimPendingAction(prisma, 1, 'APPROVED')).rejects.toThrow('이미 처리된');
  });
});

/* ── 대화 soft delete (#35 조정 9) — 운영자 허용 게이트 + updateMany(삭제 아님) ── */

describe('removeConversation', () => {
  it('허용 꺼짐(기본)이면 거부한다', async () => {
    const prisma = {
      agentSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true, allowConversationDelete: false }) },
    } as unknown as PrismaClient;
    await expect(removeConversation(prisma, 1, 1)).rejects.toThrow('허용되어 있지 않습니다');
  });

  it('허용이면 hard delete 가 아니라 deletedAt 을 찍는다', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      agentSettings: { findUnique: vi.fn().mockResolvedValue({ enabled: true, allowConversationDelete: true }) },
      agentConversation: { updateMany },
    } as unknown as PrismaClient;
    await removeConversation(prisma, 1, 5);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 5, userId: 1, deletedAt: null }),
        data: { deletedAt: expect.any(Date) },
      }),
    );
  });
});
