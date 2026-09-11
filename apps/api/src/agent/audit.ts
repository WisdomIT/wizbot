import type { PrismaClient } from '@prisma/client';
import { chatActorName, sanitizeAuditInput } from '@wizbot/shared/lib/audit';

/** 채팅으로 시킨 사람 (#262) — 콘솔 패널은 없다(본인) */
export interface AgentRequester {
  channelId: string;
  nickname: string;
}

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
  requester?: AgentRequester,
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        actorType: 'AGENT',
        //  채팅 요청이면 누가 시켰는지도 — 매니저가 부를 수 있으므로 (#262). VarChar(120)
        actorName: (requester
          ? `대화 ${conversationId} · ${chatActorName({ senderNickname: requester.nickname, senderChannelId: requester.channelId })}`
          : `대화 ${conversationId}`
        ).slice(0, 120),
        procedure: `agent.${toolName}`,
        input: sanitizeAuditInput(input) ?? undefined,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[agent] 감사 기록 실패:', error);
  }
}
