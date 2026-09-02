import { z } from 'zod';

import { agentService } from '../services';
import { adminProcedure, streamerProcedure, t } from '../trpc';

const providerFields = {
  name: z.string().max(60),
  apiKey: z.string().max(255),
  baseUrl: z.string().max(255).nullable(),
  model: z.string().max(100),
};

/**
 * 설정 도우미 에이전트 (#35). 채팅 스트림은 api 의 SSE 라우트(`POST /agent/chat`)가 담당한다 —
 * 여기는 설정(어드민)과 대화 목록(스트리머)만.
 */
export const agentRouter = t.router({
  /* ── 스트리머 ── */
  status: streamerProcedure.query(async ({ ctx }) => {
    const settings = await agentService.getSettings(ctx.prisma);
    return { enabled: settings.enabled };
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

  /* ── 어드민: 전역 설정 ── */
  adminSettings: adminProcedure.query(({ ctx }) => agentService.getSettings(ctx.prisma)),
  setAdminSettings: adminProcedure
    .input(z.object({ enabled: z.boolean(), webSearchEnabled: z.boolean() }))
    .mutation(({ ctx, input }) => agentService.setSettings(ctx.prisma, input)),

  /* ── 어드민: 프로바이더 목록 (키는 끝 4자만) ── */
  providers: adminProcedure.query(({ ctx }) => agentService.listProvidersMasked(ctx.prisma)),
  createProvider: adminProcedure
    .input(z.object({ ...providerFields, kind: z.enum(['ANTHROPIC', 'OPENAI', 'GEMINI', 'OPENAI_COMPAT']) }))
    .mutation(({ ctx, input }) => agentService.createProvider(ctx.prisma, input)),
  updateProvider: adminProcedure
    .input(z.object({ id: z.number().int().positive(), ...providerFields, enabled: z.boolean() }))
    .mutation(({ ctx, input }) => agentService.updateProvider(ctx.prisma, input.id, input)),
  deleteProvider: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => agentService.deleteProvider(ctx.prisma, input.id)),
  /** 수정 폼이 열릴 때 저장된 키로 즉시 모델 목록을 불러온다 */
  providerModels: adminProcedure
    .input(z.object({ providerId: z.number().int().positive() }))
    .query(({ ctx, input }) => agentService.probeStoredProvider(ctx.prisma, input.providerId)),
  /** 키 검증 + 모델 목록 — GET /models 하나로 (토큰 소모 없음) */
  probeProvider: adminProcedure
    .input(z.object({
      kind: z.enum(['ANTHROPIC', 'OPENAI', 'GEMINI', 'OPENAI_COMPAT']),
      apiKey: z.string().max(255),
      baseUrl: z.string().max(255).nullable(),
      providerId: z.number().int().positive().nullable(),
    }))
    .mutation(({ ctx, input }) => agentService.probeProvider(ctx.prisma, input)),
  moveProvider: adminProcedure
    .input(z.object({ id: z.number().int().positive(), direction: z.enum(['up', 'down']) }))
    .mutation(({ ctx, input }) => agentService.moveProvider(ctx.prisma, input.id, input.direction)),

  /* ── 어드민: 한도 규칙 ── */
  limits: adminProcedure.query(({ ctx }) => agentService.listLimits(ctx.prisma)),
  addLimit: adminProcedure
    .input(z.object({
      metric: z.enum(['TOKENS', 'MESSAGES']),
      scope: z.enum(['STREAMER', 'GLOBAL']),
      period: z.enum(['HOUR', 'DAY', 'WEEK', 'MONTH']),
      amount: z.number().int().min(1).max(1_000_000_000),
    }))
    .mutation(({ ctx, input }) => agentService.addLimit(ctx.prisma, input)),
  removeLimit: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => agentService.removeLimit(ctx.prisma, input.id)),
});
