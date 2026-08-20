import { z } from 'zod';

import { ChzzkError } from 'chzzk-open-sdk';

import chatbot from '../chatbot';
import { getChzzkClientForUser, repeatService } from '../services';
import { internalProcedure, publicProcedure, t } from '../trpc';

export const chatbotRouter = t.router({
  getChatbotChannelId: publicProcedure.query(() => {
    return process.env.CHZZK_BOT_CHANNEL_ID;
  }),
  getChannels: internalProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      // 챗봇을 끈 채널은 목록에서 빠진다 → 워커의 diff 동기화가 연결을 정리한다 (#7)
      where: { userSetting: { is: { chatbotActive: true } } },
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
        senderChannelId: z.string().optional(),
        senderRole: z.enum(['STREAMER', 'MANAGER', 'VIEWER']),
        content: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, senderNickname, senderChannelId, senderRole, content } = input;
      if (!userId || !senderNickname || !senderRole || !content) {
        throw new Error('Invalid input.');
      }

      const result = await chatbot(ctx, {
        userId,
        senderNickname,
        senderChannelId,
        senderRole,
        content,
      });

      // 응답 전송도 API 가 수행한다 — 워커는 유저 토큰을 만지지 않는다 (#30 토큰 소유 원칙)
      if (result.ok) {
        try {
          await getChzzkClientForUser(ctx.prisma, userId).chats.send(result.message);
        } catch (error) {
          if (error instanceof ChzzkError) {
            return { ok: false, message: `채팅 전송 실패: ${error.message}` };
          }
          throw error;
        }
      }

      return result;
    }),
  repeat: internalProcedure
    .input(z.object({ userId: z.number() }))
    // 비활성 반복은 제외 → 워커의 diff 동기화가 타이머를 정리한다 (#82)
    .query(({ ctx, input }) => repeatService.listRepeats(ctx.prisma, input.userId, true)),
  /** 반복 메시지 등 워커발 채팅 전송 — 전송 주체는 항상 API (#30) */
  send: internalProcedure
    .input(z.object({ userId: z.number(), message: z.string() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await getChzzkClientForUser(ctx.prisma, input.userId).chats.send(input.message);
        return { ok: true as const };
      } catch (error) {
        if (error instanceof ChzzkError) {
          return { ok: false as const, message: error.message };
        }
        throw error;
      }
    }),
});
