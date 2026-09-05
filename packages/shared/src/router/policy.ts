import { z } from 'zod';

import { policyService } from '../services';
import { adminProcedure, publicProcedure, t } from '../trpc';

const policyType = z.enum(['TERMS', 'PRIVACY']);

const policyInput = z.object({
  type: policyType,
  version: z.string().trim().min(1, '버전을 입력해주세요.').max(40),
  //  클라이언트는 <input type=date> 의 문자열(YYYY-MM-DD)을 보낸다 — 서버에서 Date 로 변환
  publishedAt: z.string().min(1, '등록 날짜를 입력해주세요.'),
  body: z.string().trim().min(1, '내용을 입력해주세요.').max(256 * 1024),
});

function parsePublishedAt(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('등록 날짜 형식이 올바르지 않습니다.');
  return date;
}

/** 약관 (#252) — 읽기는 공개(약관 페이지), 쓰기는 어드민 */
export const policyRouter = t.router({
  current: publicProcedure
    .input(z.object({ type: policyType }))
    .query(({ ctx, input }) => policyService.getCurrent(ctx.prisma, input.type)),
  history: publicProcedure
    .input(z.object({ type: policyType }))
    .query(({ ctx, input }) => policyService.listHistory(ctx.prisma, input.type)),
  get: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(({ ctx, input }) => policyService.getById(ctx.prisma, input.id)),

  adminList: adminProcedure.query(({ ctx }) => policyService.listAdmin(ctx.prisma)),
  create: adminProcedure
    .input(policyInput)
    .mutation(({ ctx, input }) =>
      policyService.create(ctx.prisma, { ...input, publishedAt: parsePublishedAt(input.publishedAt) }),
    ),
  update: adminProcedure
    .input(policyInput.extend({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) =>
      policyService.update(ctx.prisma, input.id, {
        type: input.type,
        version: input.version,
        publishedAt: parsePublishedAt(input.publishedAt),
        body: input.body,
      }),
    ),
  remove: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => policyService.remove(ctx.prisma, input.id)),
});
