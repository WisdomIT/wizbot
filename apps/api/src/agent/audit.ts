import type { PrismaClient } from '@prisma/client';
import { sanitizeAuditInput } from '@wizbot/shared/lib/audit';

/**
 * 에이전트가 수행한 변경의 감사 기록 (#35, #175 원칙). 서비스 계층을 직접 부르므로
 * tRPC 미들웨어를 타지 않는다 — 성공한 쓰기 tool 뒤에 명시적으로 남긴다.
 * 재생 조작·큐 추가 등 스트리머 콘솔에서도 기록하지 않는 항목(AUDIT_EXCLUDED)과 동일 기준을 쓴다.
 */
export async function recordAgentAudit(
  prisma: PrismaClient,
  userId: number,
  conversationId: number,
  toolName: string,
  input: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        actorType: 'AGENT',
        actorName: `대화 ${conversationId}`,
        procedure: `agent.${toolName}`,
        input: sanitizeAuditInput(input) ?? undefined,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[agent] 감사 기록 실패:', error);
  }
}
