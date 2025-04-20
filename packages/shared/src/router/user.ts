import { z } from 'zod';

import { t } from '../trpc';
import chzzk from '../chzzk';
import { getAccessToken } from '../lib/accessToken';

const CHZZK_URI = 'https://openapi.chzzk.naver.com';

export const userRouter = t.router({
  getUser: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findFirst();
  }),
  getChzzkId: t.procedure.query(() => {
    return process.env.CHZZK_ID;
  }),
  getChzzkTokenInterlock: t.procedure
    .input(z.object({ code: z.string(), state: z.string() }))
    .query(async ({ ctx, input }) => {
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
        throw new Error('화이트리스트에 등록되지 않은 채널입니다.');
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

      return {
        channelId,
        channelName,
        channelImageUrl,
      };
    }),
  getAccessToken: t.procedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { userId } = input;

      const accessToken = await getAccessToken(ctx, userId);

      if (!accessToken) {
        throw new Error('Access token not found');
      }

      // Return new access token
      return {
        accessToken: accessToken.accessToken,
      };
    }),
});
