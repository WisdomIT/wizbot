import { z } from 'zod';

import { notifyService } from '../services';
import { adminProcedure, t } from '../trpc';

const kindInput = z.enum(['SESSION_EXPIRED', 'SIGNUP', 'CAFE_JOIN', 'INQUIRY', 'ERROR']);

/** 디스코드 웹훅 관리 (#207) — 어드민 전용. URL 은 비밀값이라 끝 4자만 내려간다 */
export const notifyRouter = t.router({
  webhooks: adminProcedure.query(({ ctx }) => notifyService.listWebhooks(ctx.prisma)),
  setWebhook: adminProcedure
    .input(z.object({ kind: kindInput, url: z.string().max(300).nullable(), enabled: z.boolean().default(true) }))
    .mutation(({ ctx, input }) => notifyService.setWebhook(ctx.prisma, input.kind, { url: input.url, enabled: input.enabled })),
  setEnabled: adminProcedure
    .input(z.object({ kind: kindInput, enabled: z.boolean() }))
    .mutation(({ ctx, input }) => notifyService.setWebhookEnabled(ctx.prisma, input.kind, input.enabled)),
  test: adminProcedure
    .input(z.object({ kind: kindInput }))
    .mutation(({ ctx, input }) => notifyService.testWebhook(ctx.prisma, input.kind)),

  /* ── 메일(SMTP) 설정 (#215) — 비밀번호는 설정 여부만 내려간다 ── */
  mailSettings: adminProcedure.query(({ ctx }) => notifyService.getMailSettings(ctx.prisma)),
  setMailSettings: adminProcedure
    .input(z.object({
      host: z.string().max(255),
      port: z.number().int().min(1).max(65535),
      user: z.string().max(255),
      /** 비워 두면 저장된 비밀번호 유지 */
      pass: z.string().max(255),
      sender: z.string().max(255),
    }))
    .mutation(({ ctx, input }) => notifyService.setMailSettings(ctx.prisma, input)),
  resetMailSettings: adminProcedure.mutation(({ ctx }) => notifyService.resetMailSettings(ctx.prisma)),
  testMail: adminProcedure.mutation(({ ctx }) => notifyService.testMailSettings(ctx.prisma)),
});
