import type { AuditActor, PrismaClient } from '@prisma/client';

import type { AccessSubject } from '../lib/audit';

/**
 * 접근 기록 (#254) — 로그인 성공·어드민 대행 시작/종료·탈퇴를 AuditLog 에 남긴다.
 * 변경 기록(auditMutations 미들웨어)과 같은 원칙: 기록 실패가 원래 동작(로그인)을 막지 않으므로 콘솔에만 남긴다.
 * 대상 채널 식별자(subject)는 input 에 넣는다 — 탈퇴로 userId 가 비어도 기록의 주체를 알 수 있어야 한다.
 */
export async function recordAccess(
  prisma: PrismaClient,
  data: {
    procedure: 'access.login' | 'access.adminLogin' | 'access.actingStart' | 'access.actingEnd' | 'access.withdraw';
    actorType: AuditActor;
    actorId: number;
    /** 대상 스트리머. 어드민 로그인은 없음, 탈퇴는 이미 지워져 없음 */
    userId?: number | null;
    subject?: AccessSubject;
  },
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId ?? null,
        actorType: data.actorType,
        actorId: data.actorId,
        procedure: data.procedure,
        ...(data.subject ? { input: { channelId: data.subject.channelId, channelName: data.subject.channelName } } : {}),
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[audit] 접근 기록 실패:', data.procedure, error);
  }
}
