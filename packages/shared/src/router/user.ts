import { z } from 'zod';

import { getChatbotDatabaseInitial } from '../chatbot';
import {
  accountService,
  adminUsersService,
  createChzzkLoginClient,
  getChzzkAppClient,
  getChzzkClientForUser,
  userSettingService,
} from '../services';
import { internalProcedure, publicProcedure, streamerProcedure, t } from '../trpc';

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

      const findMe = await ctx.prisma.whitelist.findFirst({
        where: {
          channelId,
        },
      });
      if (!findMe) {
        throw new Error(
          '화이트리스트에 등록되지 않은 채널입니다. 하단 신청하기를 통해 신청해주세요.',
        );
      }

      const channels = await getChzzkAppClient().channels.get([channelId]);
      if (channels.length === 0) {
        throw new Error('치지직 채널 정보를 가져오지 못했습니다.');
      }
      const { channelName, channelImageUrl } = channels[0];

      const user = await ctx.prisma.user.upsert({
        where: { channelId },
        update: {
          channelName,
          channelImageUrl,
        },
        create: {
          channelId,
          channelName,
          channelImageUrl,
        },
      });

      const findSetting = await ctx.prisma.userSetting.findFirst({
        where: {
          userId: user.id,
        },
      });
      if (!findSetting) {
        await ctx.prisma.userSetting.create({
          data: {
            userId: user.id,
          },
        });
      }

      // 발급받은 토큰을 해당 유저의 DB TokenStore 로 영속화
      await getChzzkClientForUser(ctx.prisma, user.id).auth.setTokens(tokenSet);

      //functionCommand에 데이터가 하나도 없다면 기본값 세팅 (첫 로그인 시)
      const findCommand = await ctx.prisma.chatbotFunctionCommand.findFirst({
        where: {
          userId: user.id,
        },
      });

      const { initialFunction, initialEcho } = getChatbotDatabaseInitial(user.id);

      if (!findCommand) {
        await ctx.prisma.chatbotFunctionCommand.createMany({
          data: initialFunction,
        });
        await ctx.prisma.chatbotEchoCommand.createMany({
          data: initialEcho,
        });
      }

      return {
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
