import { z } from 'zod';

import { sendMail } from '../lib/nodemailer';
import { signupService } from '../services';
import { applicantProcedure, t } from '../trpc';
import type { PrismaClient, SignupApplication } from '@prisma/client';

/**
 * 새 신청(또는 재신청)이 들어오면 관리자 전원에게 메일. 실패해도 신청 흐름을 막지 않는다 —
 * SMTP 가 비어 있는 환경(개발)에서는 매번 실패하는 게 정상이다.
 */
export async function notifyAdminsOfApplication(
  prisma: PrismaClient,
  application: Pick<SignupApplication, 'channelName' | 'channelId' | 'reason'>,
) {
  try {
    const admins = await prisma.admin.findMany({ select: { email: true } });
    if (admins.length === 0) return;
    const site = process.env.PUBLIC_SITE_URL ?? '';
    await sendMail({
      to: admins.map((admin) => admin.email).join(','),
      subject: `[위즈봇] 사용 신청: ${application.channelName}`,
      text: [
        `${application.channelName} 채널이 위즈봇 사용을 신청했습니다.`,
        `채널 ID: ${application.channelId}`,
        application.reason ? `사유: ${application.reason}` : '사유: (없음)',
        '',
        `처리: ${site}/admin/applications`,
      ].join('\n'),
    });
  } catch {
    /* 알림 실패는 신청과 무관하다 */
  }
}

/** 사용 신청자(applicant 세션) 전용 (#96) */
export const signupRouter = t.router({
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
