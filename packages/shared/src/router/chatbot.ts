import { z } from 'zod';

import chatbot from '../chatbot';
import { t } from '../trpc';

export const chatbotRouter = t.router({
  getChannels: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      select: {
        id: true,
        channelId: true,
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
        return {
          ok: false,
          message: 'Invalid input',
        };
      }

      return await chatbot(ctx, { userId, senderNickname, senderRole, content });
    }),
});
