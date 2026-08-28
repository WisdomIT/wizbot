import { randomInt } from 'node:crypto';

import { z } from 'zod';

import { sendMail } from '../lib/nodemailer';
import { adminUsersService, ServiceError, signupService, whitelistService } from '../services';
import { adminProcedure, publicProcedure, t } from '../trpc';

/** 패스코드 유효시간 — 넘으면 소모 전이라도 무효 (#20) */
const PASSCODE_TTL_MS = 10 * 60 * 1000;
/** 재발송 쿨다운 — 메일 폭탄/무차별 재발급 방지 (#20) */
const RESEND_COOLDOWN_MS = 60 * 1000;

function randomPasscode(length: number) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(randomInt(characters.length));
  }
  return result;
}

export const adminRouter = t.router({
  /**
   * 패스코드 생성 + 매직 링크 메일 발송 (#19 mutation, #20 강화).
   * ⚠ 계정 존재 여부를 응답으로 노출하지 않는다 — 항상 동일한 ok 응답.
   */
  login: publicProcedure.input(z.object({ email: z.string() })).mutation(async ({ ctx, input }) => {
    const { email } = input;
    const okResponse = { ok: true as const };

    const adminFind = await ctx.prisma.admin.findFirst({ where: { email } });
    if (!adminFind) {
      return okResponse; // 존재하지 않는 계정 — 티내지 않고 종료
    }

    const existing = await ctx.prisma.adminLogin.findUnique({ where: { adminId: adminFind.id } });
    if (existing && Date.now() - existing.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      return okResponse; // 쿨다운 중 — 재발급/재발송하지 않음
    }

    const randomCode = randomPasscode(6);

    await ctx.prisma.adminLogin.upsert({
      where: { adminId: adminFind.id },
      create: { adminId: adminFind.id, passcode: randomCode },
      update: { passcode: randomCode, createdAt: new Date() },
    });

    await sendMail({
      to: email,
      subject: '위즈봇 관리자 로그인',
      text: `위즈봇 관리자 로그인 링크입니다. 아래 링크를 클릭하여 로그인하세요. (10분간 유효)\n\n${
        process.env.PUBLIC_SITE_URL ?? ''
      }/login/admin?email=${encodeURIComponent(email)}&code=${randomCode}`,
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error sending email:', error);
      throw new Error('이메일 전송에 실패했습니다.');
    });

    return okResponse;
  }),

  /**
   * 패스코드 검증 + 소모 (#19 mutation, #20 강화).
   * 시도 즉시 패스코드를 삭제하므로 코드당 검증 기회는 1회다 (무차별 대입 불가).
   */
  loginCheck: publicProcedure
    .input(z.object({ email: z.string(), code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { email, code } = input;
      const invalid = () => new ServiceError('FORBIDDEN', '유효하지 않거나 만료된 링크입니다.');

      const adminFind = await ctx.prisma.admin.findFirst({ where: { email } });
      if (!adminFind) {
        throw invalid(); // 계정 존재 여부를 구분해 노출하지 않는다
      }

      const loginFind = await ctx.prisma.adminLogin.findUnique({
        where: { adminId: adminFind.id },
      });

      // 시도 자체로 소모 — 성공/실패와 무관하게 삭제
      await ctx.prisma.adminLogin.deleteMany({ where: { adminId: adminFind.id } });

      if (!loginFind || loginFind.passcode !== code) {
        throw invalid();
      }
      if (Date.now() - loginFind.createdAt.getTime() > PASSCODE_TTL_MS) {
        throw invalid();
      }

      return { id: adminFind.id };
    }),

  /* ── 화이트리스트 관리 (#10) ── */
  listWhitelist: adminProcedure.query(({ ctx }) => whitelistService.listWhitelist(ctx.prisma)),
  addToWhitelist: adminProcedure
    .input(z.object({ channelId: z.string() }))
    .mutation(({ ctx, input }) => whitelistService.addToWhitelist(ctx.prisma, input.channelId)),
  removeFromWhitelist: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => whitelistService.removeFromWhitelist(ctx.prisma, input.id)),

  /* ── 사용 신청 관리 (#96) ── */
  listApplications: adminProcedure.query(({ ctx }) =>
    signupService.listApplications(ctx.prisma),
  ),
  approveApplication: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => signupService.approve(ctx.prisma, input.id, ctx.user.id)),
  rejectApplication: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().max(500).optional() }))
    .mutation(({ ctx, input }) =>
      signupService.reject(ctx.prisma, input.id, ctx.user.id, input.reason),
    ),
  getSignupSettings: adminProcedure.query(({ ctx }) => signupService.getSettings(ctx.prisma)),
  setSignupSettings: adminProcedure
    .input(z.object({ autoApprove: z.boolean().optional(), askReason: z.boolean().optional() }))
    .mutation(({ ctx, input }) => signupService.setSettings(ctx.prisma, input)),

  /* ── 스트리머 관리 (#10 PR B) ── */
  listStreamers: adminProcedure.query(({ ctx }) => adminUsersService.listStreamers(ctx.prisma)),
  setStreamerHidden: adminProcedure
    .input(z.object({ userId: z.number(), hidden: z.boolean() }))
    .mutation(({ ctx, input }) =>
      adminUsersService.setStreamerHidden(ctx.prisma, input.userId, input.hidden),
    ),
  deleteStreamer: adminProcedure
    .input(z.object({ userId: z.number(), removeWhitelist: z.boolean().optional() }))
    .mutation(({ ctx, input }) =>
      adminUsersService.deleteStreamer(ctx.prisma, input.userId, {
        removeWhitelist: input.removeWhitelist,
      }),
    ),

  /* ── 관리자 계정 관리 (#10 PR B) ── */
  listAdmins: adminProcedure.query(({ ctx }) => adminUsersService.listAdmins(ctx.prisma)),
  addAdmin: adminProcedure
    .input(z.object({ email: z.string().email('올바른 이메일 주소를 입력해주세요.') }))
    .mutation(({ ctx, input }) => adminUsersService.addAdmin(ctx.prisma, input.email)),
  removeAdmin: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => adminUsersService.removeAdmin(ctx.prisma, input.id, ctx.user.id)),

  /** 로그인한 관리자 본인 정보 */
  me: adminProcedure.query(async ({ ctx }) => {
    const admin = await ctx.prisma.admin.findUnique({
      where: { id: ctx.user.id },
      select: { id: true, email: true },
    });
    if (!admin) throw new ServiceError('NOT_FOUND', '관리자 계정을 찾을 수 없습니다.');
    return admin;
  }),
});
