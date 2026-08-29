import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { gatePicksSchema } from '../lib/cafeGate';
import { CAFE_SCENES, cafeLayoutSchema, cafeSnapshotSchema } from '../lib/cafeLayout';
import { sendMail } from '../lib/nodemailer';
import { cafeService } from '../services';
import { adminProcedure, internalProcedure, publicProcedure, streamerProcedure, t } from '../trpc';

const gateBoxSchema = z.object({
  path: z.array(z.number().int()),
  tag: z.string().max(32),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  marker: z.enum(['image', 'youtube']).optional(),
});
const gateRenderSchema = z.object({
  png: z.string().max(8 * 1024 * 1024),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  boxes: z.array(gateBoxSchema).max(2000),
});
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

/** 봇 세션 만료 알림 (#9 PR4) — 전체 스트리머의 대문 갱신이 멈추므로 운영자 전원에게. 실패해도 검사 결과는 기록된다 */
async function notifyAdminsOfSessionExpiry(prisma: PrismaClient, message: string | null) {
  try {
    const admins = await prisma.admin.findMany({ select: { email: true } });
    if (admins.length === 0) return;
    const site = process.env.PUBLIC_SITE_URL ?? '';
    await sendMail({
      to: admins.map((admin) => admin.email).join(','),
      subject: '[위즈봇] 네이버 봇 계정 세션 만료 — 카페 대문 갱신 중단',
      text: [
        '네이버 봇 계정의 세션(NID_AUT / NID_SES)이 만료됐습니다. 모든 스트리머의 카페 대문 갱신이 멈춰 있습니다.',
        message ? `워커 메시지: ${message}` : '',
        '',
        `어드민 > 네이버 봇 계정에서 새 쿠키를 등록하면 즉시 다시 검사하고 자동으로 재개됩니다: ${site}/admin/naver-bot`,
      ].join('\n'),
    });
    await cafeService.markSessionAlerted(prisma);
  } catch {
    /* 알림 실패는 다음 검사에서 다시 시도된다 (alertedAt 이 비어 있으므로) */
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
    .input(z.object({ input: z.string().max(200).nullable() }))
    .mutation(({ ctx, input }) => cafeService.setYoutube(ctx.prisma, ctx.user.id, input.input)),
  /** 스트리머 안내용 — 봇 계정 이름과 세션 상태(만료면 갱신이 멈춘다). 쿠키는 내려가지 않는다 */
  botStatus: streamerProcedure.query(({ ctx }) => cafeService.getBotStatus(ctx.prisma)),

  /* ── 대문 HTML 가져오기·삽입 (#9 PR3) ── */
  requestGateFetch: streamerProcedure.mutation(({ ctx }) => cafeService.requestGateFetch(ctx.prisma, ctx.user.id)),
  gate: streamerProcedure.query(({ ctx }) => cafeService.getGate(ctx.prisma, ctx.user.id)),
  savePicks: streamerProcedure
    .input(gatePicksSchema)
    .mutation(({ ctx, input }) => cafeService.savePicks(ctx.prisma, ctx.user.id, input)),

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
  completeGateFetch: internalProcedure
    .input(
      z.object({
        id: z.number(),
        html: z.string().max(2 * 1024 * 1024),
        render: z
          .object({
            png: z.string().max(8 * 1024 * 1024),
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            boxes: z.array(gateBoxSchema).max(2000),
          })
          .nullable(),
      }),
    )
    .mutation(({ ctx, input }) => cafeService.completeGateFetch(ctx.prisma, input.id, { html: input.html, render: input.render })),
  completeGateSave: internalProcedure
    .input(
      z.object({ id: z.number() }).and(
        z.discriminatedUnion('ok', [
          z.object({ ok: z.literal(true), html: z.string().max(2 * 1024 * 1024), picks: gatePicksSchema, render: gateRenderSchema.nullable() }),
          z.object({ ok: z.literal(false), message: z.string().max(500), stale: z.boolean().optional() }),
        ]),
      ),
    )
    .mutation(({ ctx, input }) => cafeService.completeGateSave(ctx.prisma, input.id, input)),
  /* ── 워커: 방송 상태 폴링·대문 갱신 (#9 PR3b) ── */
  activeIntegrations: internalProcedure.query(({ ctx }) => cafeService.listActive(ctx.prisma)),
  evaluateLive: internalProcedure
    .input(z.object({ id: z.number(), snapshot: cafeSnapshotSchema }))
    .mutation(({ ctx, input }) => cafeService.evaluateLive(ctx.prisma, input.id, input.snapshot)),
  reportSave: internalProcedure
    .input(
      z.object({ id: z.number() }).and(
        z.discriminatedUnion('ok', [
          z.object({ ok: z.literal(true), serial: z.number().int(), html: z.string().max(2 * 1024 * 1024) }),
          z.object({ ok: z.literal(false), message: z.string().max(500), missing: z.boolean().optional(), html: z.string().max(2 * 1024 * 1024).optional() }),
        ]),
      ),
    )
    .mutation(({ ctx, input }) => cafeService.reportSave(ctx.prisma, input.id, input)),
  botSession: internalProcedure.query(async ({ ctx }) => {
    const row = await cafeService.getBotSession(ctx.prisma);
    //  updatedAt > checkedAt 이면 어드민이 새로 저장한 것 — 워커가 즉시 검사한다
    if (!row) return null;
    //  세션 검사는 대문 편집기를 열어 본다 — 연동된 카페가 있으면 그 카페로 (없으면 워커의 기본 공개 카페)
    const linked = await ctx.prisma.cafeIntegration.findFirst({ where: { clubId: { not: null } }, select: { clubId: true }, orderBy: { id: 'asc' } });
    return { nidAut: row.nidAut, nidSes: row.nidSes, updatedAt: row.updatedAt, checkedAt: row.checkedAt, valid: row.valid, probeClubId: linked?.clubId ?? null };
  }),
  reportSessionCheck: internalProcedure
    .input(z.object({ valid: z.boolean(), message: z.string().max(500).nullable() }))
    .mutation(async ({ ctx, input }) => {
      const { transition } = await cafeService.reportSessionCheck(ctx.prisma, input);
      if (transition === 'expired') await notifyAdminsOfSessionExpiry(ctx.prisma, input.message);
      return { transition };
    }),
});
