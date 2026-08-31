import { z } from 'zod';

import { noticeService } from '../services';
import { adminProcedure, publicProcedure, t } from '../trpc';

const noticeInput = z.object({
  title: z.string().trim().min(1, '제목을 입력해주세요.').max(200),
  body: z.string().trim().min(1, '내용을 입력해주세요.').max(64 * 1024),
  popup: z.boolean().default(false),
});

/** 공지사항 (#206) — 읽기는 공개(랜딩·시청자 페이지), 쓰기는 어드민 */
export const noticeRouter = t.router({
  list: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).default({}))
    .query(({ ctx, input }) => noticeService.listPublic(ctx.prisma, input.limit)),
  get: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => noticeService.getPublic(ctx.prisma, input.id)),

  adminList: adminProcedure.query(({ ctx }) => noticeService.listAdmin(ctx.prisma)),
  create: adminProcedure.input(noticeInput).mutation(({ ctx, input }) => noticeService.create(ctx.prisma, input)),
  update: adminProcedure
    .input(noticeInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => noticeService.update(ctx.prisma, input.id, { title: input.title, body: input.body, popup: input.popup })),
  remove: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => noticeService.remove(ctx.prisma, input.id)),
});
