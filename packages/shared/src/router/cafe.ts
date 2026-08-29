import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { CAFE_SCENES, cafeLayoutSchema } from '../lib/cafeLayout';
import { sendMail } from '../lib/nodemailer';
import { cafeService } from '../services';
import { adminProcedure, internalProcedure, publicProcedure, streamerProcedure, t } from '../trpc';

const linkStatus = z.enum(['NONE', 'JOIN_REQUESTED', 'JOINED', 'JOIN_FAILED', 'PERMISSION_OK', 'PERMISSION_FAILED', 'ACTIVE']);

/** 운영자에게 가입 요청 알림. 실패해도 요청은 성공이다 (SMTP 없는 개발 환경) */
async function notifyAdminsOfJoinRequest(
  prisma: PrismaClient,
  request: { channelName: string; cafeName: string | null; clubId: string | null },
) {
  try {
    const admins = await prisma.admin.findMany({ select: { email: true } });
    if (admins.length === 0) return;
    const site = process.env.PUBLIC_SITE_URL ?? '';
    await sendMail({
      to: admins.map((admin) => admin.email).join(','),
      subject: `[위즈봇] 카페 가입 요청: ${request.cafeName ?? request.clubId}`,
      text: [
        `${request.channelName} 채널이 카페 대문 자동화를 위해 봇 계정의 카페 가입을 요청했습니다.`,
        `카페: ${request.cafeName ?? ''} (clubid ${request.clubId})`,
        `가입 페이지: https://cafe.naver.com/ca-fe/cafes/${request.clubId}/join`,
        '',
        `처리: ${site}/admin/naver-bot`,
      ].join('\n'),
    });
  } catch {
    /* 알림 실패는 요청과 무관하다 */
  }
}

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
  requestJoin: streamerProcedure.mutation(async ({ ctx }) => {
    const row = await cafeService.requestJoin(ctx.prisma, ctx.user.id);
    const user = await ctx.prisma.user.findUnique({ where: { id: ctx.user.id }, select: { channelName: true } });
    void notifyAdminsOfJoinRequest(ctx.prisma, {
      channelName: user?.channelName ?? '',
      cafeName: row.cafeName,
      clubId: row.clubId,
    });
    return row;
  }),
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

  /* ── 대문 이미지 레이아웃·배경 (#9 PR2) ── */
  getLayout: streamerProcedure.query(({ ctx }) => cafeService.getLayout(ctx.prisma, ctx.user.id)),
  saveLayout: streamerProcedure
    .input(cafeLayoutSchema)
    .mutation(({ ctx, input }) => cafeService.saveLayout(ctx.prisma, ctx.user.id, input)),
  backgrounds: streamerProcedure.query(({ ctx }) => cafeService.listBackgrounds(ctx.prisma, ctx.user.id)),
  uploadBackground: streamerProcedure
    //  base64 는 원본의 4/3 — 2MB 원본이면 2.7MB
    .input(z.object({ scene: z.enum(CAFE_SCENES), base64: z.string().max(3 * 1024 * 1024) }))
    .mutation(({ ctx, input }) => cafeService.uploadBackground(ctx.prisma, ctx.user.id, input)),
  deleteBackground: streamerProcedure
    .input(z.object({ scene: z.enum(CAFE_SCENES) }))
    .mutation(({ ctx, input }) => cafeService.deleteBackground(ctx.prisma, ctx.user.id, input.scene)),
  /** web 의 /cafe/{channelId}.png 렌더용 (public — 결과 이미지도 공개다) */
  renderData: publicProcedure
    .input(z.object({ channelId: z.string(), scene: z.enum(CAFE_SCENES).optional(), preview: z.boolean().default(false) }))
    .query(({ ctx, input }) => cafeService.getRenderData(ctx.prisma, input)),

  /* ── 어드민: 가입 대기 목록 ── */
  joinRequests: adminProcedure.query(({ ctx }) => cafeService.listJoinRequests(ctx.prisma)),
  markJoined: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => cafeService.markJoined(ctx.prisma, input.id)),

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
    //  updatedAt > checkedAt 이면 어드민이 새로 저장한 것 — 워커가 즉시 검사한다
    return row ? { nidAut: row.nidAut, nidSes: row.nidSes, updatedAt: row.updatedAt, checkedAt: row.checkedAt } : null;
  }),
  reportSessionCheck: internalProcedure
    .input(z.object({ valid: z.boolean(), message: z.string().max(500).nullable() }))
    .mutation(({ ctx, input }) => cafeService.reportSessionCheck(ctx.prisma, input)),
});
