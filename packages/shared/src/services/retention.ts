import type { PrismaClient } from '@prisma/client';

import { COMMAND_LOG_RETENTION_DAYS, purgeExpired as purgeExpiredCommandLogs } from './commandLog';

/**
 * 보관 기간 (#255) — 개인정보처리방침 제3조와 실태가 어긋나지 않게 기간이 지난 데이터를 물리 삭제한다.
 * 챗봇 워커가 하루 1회 retention.purgeExpired 를 부른다. 변경 기록(감사)·노래 신청 기록·사용량 통계는
 * 방침에 기간이 없어 여기서 다루지 않는다.
 */
export const RETENTION_DAYS = {
  /** AI 에이전트 대화 — 마지막 작성일로부터 최대 1년 (방침 제3조) */
  agentConversation: 365,
  /**
   * 접근 기록(access.*) — 법정 최소 1년. 정확히 1년에 맞추면 실행 시점에 따라 미달할 수 있어 2년으로 둔다.
   * 채널 식별자만 담고 IP 는 기록하지 않는다 (#254)
   */
  accessLog: 365 * 2,
  /** 명령어 호출 로그 (#276) — 통계용. 총 호출 수는 명령어 행에 누적돼 남는다 */
  commandLog: COMMAND_LOG_RETENTION_DAYS,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * 마지막 메시지가 기준일보다 오래된 대화를 지운다. 메시지가 없는 대화는 생성일 기준.
 * soft delete(deletedAt) 여부와 무관하게 같은 기준 — 목록에서 숨긴 대화도 1년 뒤에는 실제로 사라진다.
 * 메시지·승인 대기 액션은 FK cascade 로 함께 지워지고, 사용량 통계(AgentUsage)는 FK 가 없어 남는다.
 */
export async function purgeExpiredAgentConversations(prisma: PrismaClient, now = new Date()) {
  const before = cutoff(now, RETENTION_DAYS.agentConversation);
  const { count } = await prisma.agentConversation.deleteMany({
    where: { createdAt: { lt: before }, messages: { none: { createdAt: { gte: before } } } },
  });
  return count;
}

/** 접근 기록만 — 변경 기록(command.create 등)은 기간 제한 없이 남긴다 */
export async function purgeExpiredAccessLogs(prisma: PrismaClient, now = new Date()) {
  const { count } = await prisma.auditLog.deleteMany({
    where: { procedure: { startsWith: 'access.' }, createdAt: { lt: cutoff(now, RETENTION_DAYS.accessLog) } },
  });
  return count;
}

export async function purgeExpired(prisma: PrismaClient, now = new Date()) {
  const [agentConversations, accessLogs, commandLogs] = await Promise.all([
    purgeExpiredAgentConversations(prisma, now),
    purgeExpiredAccessLogs(prisma, now),
    purgeExpiredCommandLogs(prisma, now),
  ]);
  return { agentConversations, accessLogs, commandLogs };
}
