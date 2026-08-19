import { z } from 'zod';

import { getChatbotDatabaseInitial } from '../chatbot';
import chzzk from '../chzzk';
import { getAccessToken } from '../lib/accessToken';
import { userSettingService } from '../services';
import { internalProcedure, publicProcedure, streamerProcedure, t } from '../trpc';

export const userRouter = t.router({
  getChzzkId: publicProcedure.query(() => {
    return process.env.CHZZK_ID;
  }),
  getChzzkRedirectUrl: publicProcedure.query(() => {
    return process.env.PUBLIC_SITE_URL + '/login/auth';
  }),
  getPublicSiteUrl: publicProcedure.query(() => {
    return process.env.PUBLIC_SITE_URL;
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
  getUserByChannelName: publicProcedure
    .input(z.object({ channelName: z.string() }))
    .query(async ({ ctx, input }) => {
      const { channelName } = input;

      const user = await ctx.prisma.user.findFirst({
        where: {
          channelName,
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

      const accessTokenRequest = await chzzk.authorization.accessToken({
        code,
        state,
      });
      if (accessTokenRequest.code !== 200) {
        throw new Error('Invalid response from Chzzk on access token request');
      }

      const { accessToken, refreshToken, tokenType, expiresIn } = accessTokenRequest.content;

      const meRequest = await chzzk.user.me(accessToken);
      if (meRequest.code !== 200) {
        throw new Error('Invalid response from Chzzk on me request');
      }

      const { channelId } = meRequest.content;

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

      const channelsRequest = await chzzk.channel.channels({ channelIds: [channelId] });
      if (channelsRequest.code !== 200) {
        throw new Error('Invalid response from Chzzk on channels request');
      }
      const { channelName, channelImageUrl } = channelsRequest.content.data[0];

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

      await ctx.prisma.oAuthCredential.upsert({
        where: { userId: user.id },
        update: {
          accessToken,
          refreshToken,
          tokenType,
          expiresIn: new Date(new Date().getTime() + Number(expiresIn) * 1000),
        },
        create: {
          userId: user.id,
          accessToken,
          refreshToken,
          tokenType,
          expiresIn: new Date(new Date().getTime() + Number(expiresIn) * 1000),
        },
      });

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
  /** 내부(챗봇 워커)용 — 만료 시 refresh token 갱신(DB 쓰기)이 일어나므로 mutation (#19) */
  getAccessToken: internalProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = input;

      try {
        const accessToken = await getAccessToken(ctx, userId);

        // Return new access token
        return {
          accessToken: accessToken,
        };
      } catch (error) {
        throw new Error('Access token not found');
      }
    }),
  getUserSetting: streamerProcedure.query(({ ctx }) =>
    userSettingService.getUserSetting(ctx.prisma, ctx.user.id),
  ),
  updateUserSetting: streamerProcedure
    .input(
      z.object({
        setting: z.object({
          songFavoriteAuto: z.number().nullable().optional(),
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
