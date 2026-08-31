import type { PrismaClient, SignupApplication } from '@prisma/client';
import { z } from 'zod';

import { notifyService, signupService } from '../services';
import { applicantProcedure, internalProcedure, t } from '../trpc';

/**
 * 새 신청(또는 재신청)이 들어오면 관리자 전원에게 메일. 실패해도 신청 흐름을 막지 않는다 —
 * SMTP 가 비어 있는 환경(개발)에서는 매번 실패하는 게 정상이다.
 */
export function notifyAdminsOfApplication(
  prisma: PrismaClient,
  application: Pick<SignupApplication, 'channelName' | 'channelId' | 'reason' | 'channelImageUrl'>,
) {
  const site = process.env.PUBLIC_SITE_URL ?? '';
  return notifyService.notifyAdmins(prisma, 'SIGNUP', {
    title: `사용 신청: ${application.channelName}`,
    lines: [
      `${application.channelName} 채널이 위즈봇 사용을 신청했습니다.`,
      `채널 ID: ${application.channelId}`,
      application.reason ? `사유: ${application.reason}` : '사유: (없음)',
    ],
    link: { label: '처리', url: `${site}/admin/applications` },
    fields: [
      { name: '채널명', value: application.channelName },
      { name: '채널 ID', value: application.channelId },
      application.reason ? { name: '사유', value: application.reason } : null,
    ],
    thumbnail: application.channelImageUrl,
  });
}

/** 사용 신청자(applicant 세션) 전용 (#96) */
export const signupRouter = t.router({
  /** 워커 폴링이 부른다 — 대기 중 신청의 토큰 갱신 (#151). 실제 갱신은 만료 임박한 것만 */
  refreshPendingTokens: internalProcedure.mutation(({ ctx }) =>
    signupService.refreshPendingTokens(ctx.prisma),
  ),

  /** 내 신청 상태. whitelisted 가 false 인데 APPROVED 면 승인 뒤 해제된 채널이다 */
  me: applicantProcedure.query(({ ctx }) => signupService.getMine(ctx.prisma, ctx.user.id)),

  /** 사유 제출. 거절·해제된 신청이면 다시 대기로 돌아간다(재신청) */
  submit: applicantProcedure
    .input(z.object({ reason: z.string().max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { application, reapplied } = await signupService.submitReason(
        ctx.prisma,
        ctx.user.id,
        input.reason,
      );
      if (reapplied) void notifyAdminsOfApplication(ctx.prisma, application);
      return application;
    }),
});
