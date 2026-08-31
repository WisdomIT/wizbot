import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { sendMail } from '../lib/nodemailer';
import { inquiryService } from '../services';
import { adminProcedure, streamerProcedure, t } from '../trpc';

/** 새 문의·추가 문의는 관리자 전원에게 메일 — 실패해도 문의 자체는 성공 (#206, 가입 요청 메일과 같은 패턴) */
async function notifyAdminsOfInquiry(
  prisma: PrismaClient,
  inquiry: { id: number; title: string },
  channelName: string,
  kind: '새 문의' | '추가 문의',
) {
  try {
    const admins = await prisma.admin.findMany({ select: { email: true } });
    if (admins.length === 0) return;
    const site = process.env.PUBLIC_SITE_URL ?? '';
    await sendMail({
      to: admins.map((admin) => admin.email).join(','),
      subject: `[위즈봇] ${kind}: ${inquiry.title}`,
      text: [`${channelName} 채널이 문의를 남겼습니다.`, `제목: ${inquiry.title}`, '', `답변: ${site}/admin/inquiries/${inquiry.id}`].join('\n'),
    });
  } catch {
    /* 알림 실패는 문의와 무관하다 */
  }
}

const bodyInput = z.string().trim().min(1, '내용을 입력해주세요.').max(64 * 1024);

/** 문의사항 (#206 3/3) — 스트리머 콘솔 전용, 어드민이 답한다 */
export const inquiryRouter = t.router({
  /* ── 스트리머 ── */
  list: streamerProcedure.query(({ ctx }) => inquiryService.listMine(ctx.prisma, ctx.user.id)),
  get: streamerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => inquiryService.getMine(ctx.prisma, ctx.user.id, input.id)),
  unread: streamerProcedure.query(({ ctx }) => inquiryService.unreadMine(ctx.prisma, ctx.user.id)),
  create: streamerProcedure
    .input(z.object({ title: z.string().trim().min(1, '제목을 입력해주세요.').max(200), body: bodyInput }))
    .mutation(async ({ ctx, input }) => {
      const inquiry = await inquiryService.create(ctx.prisma, ctx.user.id, input);
      const user = await ctx.prisma.user.findUnique({ where: { id: ctx.user.id }, select: { channelName: true } });
      void notifyAdminsOfInquiry(ctx.prisma, inquiry, user?.channelName ?? '', '새 문의');
      return inquiry;
    }),
  reply: streamerProcedure
    .input(z.object({ id: z.number().int().positive(), body: bodyInput }))
    .mutation(async ({ ctx, input }) => {
      const inquiry = await inquiryService.reply(ctx.prisma, ctx.user.id, input.id, input.body);
      const user = await ctx.prisma.user.findUnique({ where: { id: ctx.user.id }, select: { channelName: true } });
      void notifyAdminsOfInquiry(ctx.prisma, inquiry, user?.channelName ?? '', '추가 문의');
      return inquiry;
    }),

  /* ── 어드민 ── */
  adminList: adminProcedure.query(({ ctx }) => inquiryService.listAdmin(ctx.prisma)),
  adminGet: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => inquiryService.getAdmin(ctx.prisma, input.id)),
  adminUnread: adminProcedure.query(({ ctx }) => inquiryService.unreadAdmin(ctx.prisma)),
  adminReply: adminProcedure
    .input(z.object({ id: z.number().int().positive(), body: bodyInput }))
    .mutation(({ ctx, input }) => inquiryService.replyAdmin(ctx.prisma, input.id, input.body)),
});
