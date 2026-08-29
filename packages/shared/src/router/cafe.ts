import { z } from 'zod';

import { cafeService } from '../services';
import { adminProcedure, internalProcedure, streamerProcedure, t } from '../trpc';

const linkStatus = z.enum(['NONE', 'JOIN_REQUESTED', 'JOIN_FAILED', 'PERMISSION_OK', 'PERMISSION_FAILED', 'ACTIVE']);

/** 네이버 카페 연동 (#9) */
export const cafeRouter = t.router({
  /* ── 스트리머 ── */
  get: streamerProcedure.query(({ ctx }) => cafeService.getIntegration(ctx.prisma, ctx.user.id)),
  setEnabled: streamerProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ ctx, input }) => cafeService.setEnabled(ctx.prisma, ctx.user.id, input.enabled)),
  link: streamerProcedure
    .input(z.object({ url: z.string().max(200) }))
    .mutation(({ ctx, input }) => cafeService.linkCafe(ctx.prisma, ctx.user.id, input.url)),
  requestJoin: streamerProcedure.mutation(({ ctx }) =>
    cafeService.requestAction(ctx.prisma, ctx.user.id, 'JOIN'),
  ),
  requestVerify: streamerProcedure.mutation(({ ctx }) =>
    cafeService.requestAction(ctx.prisma, ctx.user.id, 'VERIFY'),
  ),
  setYoutube: streamerProcedure
    .input(
      z.object({
        channelId: z.string().max(24).nullable(),
        width: z.number().int().min(100).max(2000),
        height: z.number().int().min(100).max(2000),
      }),
    )
    .mutation(({ ctx, input }) => cafeService.setYoutube(ctx.prisma, ctx.user.id, input)),
  /** 스트리머 안내용 — 카페에서 승인할 봇 계정 이름. 쿠키는 내려가지 않는다 */
  botName: streamerProcedure.query(async ({ ctx }) => {
    const session = await cafeService.getBotSessionMasked(ctx.prisma);
    return session?.displayName ?? null;
  }),

  /* ── 어드민: 봇 계정 세션 ── */
  getBotSession: adminProcedure.query(({ ctx }) => cafeService.getBotSessionMasked(ctx.prisma)),
  setBotSession: adminProcedure
    .input(z.object({ displayName: z.string().max(50), nidAut: z.string().max(2000), nidSes: z.string().max(2000) }))
    .mutation(async ({ ctx, input }) => {
      await cafeService.setBotSession(ctx.prisma, input);
      return cafeService.getBotSessionMasked(ctx.prisma);
    }),

  /* ── 워커 (internal) ── */
  pendingActions: internalProcedure.query(({ ctx }) => cafeService.listPendingActions(ctx.prisma)),
  completeAction: internalProcedure
    .input(z.object({ id: z.number(), status: linkStatus, message: z.string().max(500).nullable() }))
    .mutation(({ ctx, input }) =>
      cafeService.completeAction(ctx.prisma, input.id, { status: input.status, message: input.message }),
    ),
  botSession: internalProcedure.query(async ({ ctx }) => {
    const row = await cafeService.getBotSession(ctx.prisma);
    return row ? { nidAut: row.nidAut, nidSes: row.nidSes } : null;
  }),
  reportSessionCheck: internalProcedure
    .input(z.object({ valid: z.boolean(), message: z.string().max(500).nullable() }))
    .mutation(({ ctx, input }) => cafeService.reportSessionCheck(ctx.prisma, input)),
});
