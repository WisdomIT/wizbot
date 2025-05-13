import { z } from 'zod';

import chatbot from '../chatbot';
import { t } from '../trpc';

export const chatbotRouter = t.router({
  getChatbotChannelId: t.procedure.query(() => {
    return process.env.CHZZK_BOT_CHANNEL_ID;
  }),
  getChannels: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      select: {
        id: true,
        channelId: true,
        channelName: true,
      },
    });
  }),
  message: t.procedure
    .input(
      z.object({
        userId: z.number(),
        senderNickname: z.string(),
        senderRole: z.enum(['STREAMER', 'MANAGER', 'VIEWER']),
        content: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { userId, senderNickname, senderRole, content } = input;
      if (!userId || !senderNickname || !senderRole || !content) {
        throw new Error('Invalid input.');
      }

      return await chatbot(ctx, { userId, senderNickname, senderRole, content });
    }),
  repeat: t.procedure
    .input(
      z.object({
        userId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { userId } = input;
      if (!userId) {
        throw new Error('Invalid input.');
      }

      const findRepeat = await ctx.prisma.chatbotRepeat.findMany({
        where: {
          userId,
        },
      });

      return findRepeat;
    }),
});
