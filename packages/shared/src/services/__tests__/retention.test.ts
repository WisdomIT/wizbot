import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  purgeExpired,
  purgeExpiredAccessLogs,
  purgeExpiredAgentConversations,
  RETENTION_DAYS,
} from '../retention';

const NOW = new Date('2026-09-10T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

function createPrisma() {
  const agentConversation = { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) };
  const auditLog = { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) };
  return { prisma: { agentConversation, auditLog } as unknown as PrismaClient, agentConversation, auditLog };
}

describe('retention (#255)', () => {
  it('에이전트 대화 — 1년 전 기준으로, 그 뒤에 쓴 메시지가 없는 대화만 지운다 (soft delete 여부 무관)', async () => {
    const { prisma, agentConversation } = createPrisma();
    await expect(purgeExpiredAgentConversations(prisma, NOW)).resolves.toBe(3);

    const before = daysAgo(RETENTION_DAYS.agentConversation);
    expect(agentConversation.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: before }, messages: { none: { createdAt: { gte: before } } } },
    });
    // deletedAt 조건이 없어야 숨긴 대화도 같은 기준으로 사라진다
    expect(JSON.stringify(agentConversation.deleteMany.mock.calls[0])).not.toContain('deletedAt');
  });

  it('접근 기록 — access.* 만, 2년 전 기준. 변경 기록은 건드리지 않는다', async () => {
    const { prisma, auditLog } = createPrisma();
    await expect(purgeExpiredAccessLogs(prisma, NOW)).resolves.toBe(5);

    expect(RETENTION_DAYS.accessLog).toBeGreaterThanOrEqual(365);
    expect(auditLog.deleteMany).toHaveBeenCalledWith({
      where: { procedure: { startsWith: 'access.' }, createdAt: { lt: daysAgo(RETENTION_DAYS.accessLog) } },
    });
  });

  it('purgeExpired 는 둘 다 돌리고 건수를 돌려준다', async () => {
    const { prisma, agentConversation, auditLog } = createPrisma();
    await expect(purgeExpired(prisma, NOW)).resolves.toEqual({ agentConversations: 3, accessLogs: 5 });
    expect(agentConversation.deleteMany).toHaveBeenCalledTimes(1);
    expect(auditLog.deleteMany).toHaveBeenCalledTimes(1);
  });
});
