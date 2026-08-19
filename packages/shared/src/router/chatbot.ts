import { z } from 'zod';

import chatbot from '../chatbot';
import { repeatService } from '../services';
import { internalProcedure, publicProcedure, t } from '../trpc';

export const chatbotRouter = t.router({
  getChatbotChannelId: publicProcedure.query(() => {
    return process.env.CHZZK_BOT_CHANNEL_ID;
  }),
  getChannels: internalProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      select: {
        id: true,
        channelId: true,
        channelName: true,
      },
    });
  }),
  /** 채팅 1건 처리 — 명령어 생성/삭제·방송 설정 변경 등 부수효과 + 긴 본문이 URL(GET)에 실리면 안 되므로 mutation (#19) */
  message: internalProcedure
    .input(
      z.object({
        userId: z.number(),
        senderNickname: z.string(),
        senderRole: z.enum(['STREAMER', 'MANAGER', 'VIEWER']),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, senderNickname, senderRole, content } = input;
      if (!userId || !senderNickname || !senderRole || !content) {
        throw new Error('Invalid input.');
      }

      return await chatbot(ctx, { userId, senderNickname, senderRole, content });
    }),
  repeat: internalProcedure
    .input(z.object({ userId: z.number() }))
    .query(({ ctx, input }) => repeatService.listRepeats(ctx.prisma, input.userId)),
});
