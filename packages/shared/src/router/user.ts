import { z } from 'zod';

import { getChatbotDatabaseInitial } from '../chatbot';
import {
  accountService,
  adminUsersService,
  createChzzkLoginClient,
  getChzzkAppClient,
  getChzzkClientForUser,
  provisionService,
  signupService,
  userSettingService,
} from '../services';
import { internalProcedure, publicProcedure, streamerProcedure, t } from '../trpc';
import { notifyAdminsOfApplication } from './signup';

export const userRouter = t.router({
  getChzzkId: publicProcedure.query(() => {
    return process.env.CHZZK_ID;
  }),
  /** 내부(챗봇 워커)용 — 임의 사용자 조회 */
  getUser: internalProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    return ctx.prisma.user.findFirst({
      where: {
        id: input.id,
      },
    });
  }),
  /** 로그인한 스트리머 본인 정보 */
  me: streamerProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findFirst({
      where: { id: ctx.user.id },
      select: { id: true, channelId: true, channelName: true, channelImageUrl: true },
    });
  }),
  getUsersPublic: publicProcedure.query(async ({ ctx }) => {
    const users = await ctx.prisma.user.findMany({
      select: {
        channelId: true,
        channelName: true,
        channelImageUrl: true,
        userShortcuts: {
          select: {
            name: true,
            url: true,
            icon: true,
          },
          orderBy: {
            order: 'asc',
          },
          take: 6,
        },
      },
      where: {
        hidden: false,
      },
    });

    return users;
  }),
  /** 시청자 공개 페이지용 — 경로 식별자는 불변인 channelId 를 쓴다 (#72) */
  getUserByChannelId: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { channelId } = input;

      // hidden 은 '목록 노출' 여부일 뿐, 직접 링크로 오는 시청자 페이지는 항상 열어둔다 (#7)
      const user = await ctx.prisma.user.findUnique({
        where: {
          channelId,
        },
        select: {
          channelId: true,
          channelName: true,
          channelImageUrl: true,
          userShortcuts: {
            select: {
              name: true,
              url: true,
              icon: true,
            },
            orderBy: {
              order: 'asc',
            },
          },
        },
      });

      return user;
    }),
  /** 인가 코드 교환 + 사용자/토큰 upsert — 부수효과가 있으므로 mutation (#19) */
  getChzzkTokenInterlock: publicProcedure
    .input(z.object({ code: z.string(), state: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { code, state } = input;

      // userId 를 알기 전이므로 메모리 스토어의 일회성 클라이언트로 교환한다 (#30)
      const loginClient = createChzzkLoginClient();
      const tokenSet = await loginClient.auth.login({ code, state });

      const { channelId } = await loginClient.users.me();

      const channels = await getChzzkAppClient().channels.get([channelId]);
      if (channels.length === 0) {
        throw new Error('치지직 채널 정보를 가져오지 못했습니다.');
      }
      const { channelName, channelImageUrl } = channels[0];

      // 화이트리스트에 없으면 에러로 끝내지 않는다 — OAuth 로 본인이 확인된 상태이므로
      // 신청 레코드를 만들고 신청자 세션으로 보낸다 (#96)
      const identity = { channelId, channelName, channelImageUrl: channelImageUrl ?? null };
      const whitelisted = await ctx.prisma.whitelist.findUnique({ where: { channelId } });
      if (!whitelisted) {
        if (await signupService.getAutoApprove(ctx.prisma)) {
          // 자동 승인 — 등록하고 아래 일반 로그인 경로를 그대로 탄다
          await signupService.autoApprove(ctx.prisma, identity);
        } else {
          // 토큰도 함께 맡긴다 — 대기 중 갱신해 두면 승인 즉시 봇이 붙는다 (#151)
          const { application, created } = await signupService.upsertOnLogin(
            ctx.prisma,
            identity,
            tokenSet,
          );
          if (created) void notifyAdminsOfApplication(ctx.prisma, application);
          return {
            kind: 'applicant' as const,
            applicationId: application.id,
            status: application.status,
          };
        }
      }

      // User·UserSetting·토큰·기본 명령어 — 신청 승인 경로와 같은 함수 (#151)
      const user = await provisionService.provisionStreamer(ctx.prisma, identity, {
        tokens: tokenSet,
        initialCommands: getChatbotDatabaseInitial,
      });
      // 승인 후 첫 로그인이면 채팅 안내를 멈춘다
      await signupService.acknowledge(ctx.prisma, channelId);

      return {
        kind: 'streamer' as const,
        userId: user.id,
        channelId,
        channelName,
        channelImageUrl,
      };
    }),
  /** 내부(챗봇 워커)용 — 만료 시 refresh token 갱신(DB 쓰기)이 일어나므로 mutation. get* 이름은 오해 소지가 있어 ensure* 로 (#19) */
  ensureAccessToken: internalProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // SDK 가 만료 임박 시 선제 갱신하고 새 토큰 묶음을 DB TokenStore 에 저장한다 (#30)
      const accessToken = await getChzzkClientForUser(
        ctx.prisma,
        input.userId,
      ).auth.getAccessToken();

      // 워커의 read-only TokenStore 용으로 남은 유효시간(초)도 알려준다 (여기 도달 시점엔 항상 존재·신선)
      const credential = await ctx.prisma.oAuthCredential.findUnique({
        where: { userId: input.userId },
      });
      const expiresIn = credential
        ? Math.max(0, Math.floor((credential.expiresIn.getTime() - Date.now()) / 1000))
        : 0;

      return { accessToken, expiresIn };
    }),
  /* ── 계정 설정 (#7) ── */
  getAccount: streamerProcedure.query(({ ctx }) =>
    accountService.getAccount(ctx.prisma, ctx.user.id),
  ),
  refreshChannelInfo: streamerProcedure.mutation(({ ctx }) =>
    accountService.refreshChannelInfo(ctx.prisma, ctx.user.id),
  ),
  setListed: streamerProcedure
    .input(z.object({ listed: z.boolean() }))
    .mutation(({ ctx, input }) => accountService.setListed(ctx.prisma, ctx.user.id, input.listed)),
  setChatbotActive: streamerProcedure
    .input(z.object({ active: z.boolean() }))
    .mutation(({ ctx, input }) =>
      accountService.setChatbotActive(ctx.prisma, ctx.user.id, input.active),
    ),
  /** 본인 탈퇴 — 어드민의 탈퇴 처리와 같은 서비스(연관 데이터 cascade 삭제) */
  deleteSelf: streamerProcedure.mutation(({ ctx }) =>
    adminUsersService.deleteStreamer(ctx.prisma, ctx.user.id),
  ),

  getUserSetting: streamerProcedure.query(({ ctx }) =>
    userSettingService.getUserSetting(ctx.prisma, ctx.user.id),
  ),
  updateUserSetting: streamerProcedure
    .input(
      z.object({
        setting: z.object({
          songKeyboardShortcut: z.boolean().optional(),
          songActive: z.boolean().optional(),
          chatbotDefaultRepeat: z.number().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await userSettingService.updateUserSetting(ctx.prisma, ctx.user.id, input.setting);
    }),
});
