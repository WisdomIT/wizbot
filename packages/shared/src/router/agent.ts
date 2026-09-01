import { z } from 'zod';

import { AGENT_MODELS, agentService } from '../services';
import { adminProcedure, streamerProcedure, t } from '../trpc';

/**
 * 설정 도우미 에이전트 (#35). 채팅 스트림은 tRPC 가 아니라 api 의 SSE 라우트
 * (`POST /agent/chat`)가 담당한다 — 여기는 설정(어드민)과 대화 목록(스트리머)만.
 */
export const agentRouter = t.router({
  /* ── 스트리머 ── */
  /** 패널 표시 여부·오늘 사용량 */
  status: streamerProcedure.query(async ({ ctx }) => {
    const settings = await agentService.getSettings(ctx.prisma);
    if (!settings?.enabled) return { enabled: false as const };
    const used = await agentService.dailyTokensUsed(ctx.prisma, ctx.user.id);
    return { enabled: true as const, dailyTokenLimit: settings.dailyTokenLimit, usedTokens: used };
  }),
  conversations: streamerProcedure.query(({ ctx }) => agentService.listConversations(ctx.prisma, ctx.user.id)),
  conversation: streamerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const conversation = await agentService.getConversation(ctx.prisma, ctx.user.id, input.id);
      //  Prisma Json 을 tRPC 로 그대로 내보내면 타입 추론이 터진다(TS2589, #175) — 문자열로
      return {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages.map((row) => ({
          id: row.id,
          role: row.role,
          contentJson: JSON.stringify(row.content),
        })),
      };
    }),
  createConversation: streamerProcedure.mutation(({ ctx }) => agentService.createConversation(ctx.prisma, ctx.user.id)),
  deleteConversation: streamerProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => agentService.removeConversation(ctx.prisma, ctx.user.id, input.id)),

  /* ── 어드민: 설정 (#215 패턴 — 키는 끝 4자만) ── */
  adminSettings: adminProcedure.query(({ ctx }) => agentService.getSettingsMasked(ctx.prisma)),
  setAdminSettings: adminProcedure
    .input(z.object({
      /** 비워 두면 저장된 키 유지 */
      apiKey: z.string().max(255),
      model: z.enum(AGENT_MODELS),
      dailyTokenLimit: z.number().int().min(1000).max(100_000_000),
      enabled: z.boolean(),
    }))
    .mutation(({ ctx, input }) => agentService.setSettings(ctx.prisma, input)),
});
