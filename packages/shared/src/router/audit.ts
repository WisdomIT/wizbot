import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { accessLogService, ServiceError } from '../services';
import { adminProcedure, streamerProcedure, t } from '../trpc';

const AUDIT_ACTORS = ['STREAMER', 'ADMIN', 'CHATBOT', 'AGENT'] as const;
const ACCESS_PREFIX = 'access.';

/**
 * 설정 변경 기록 조회 (#175). 스트리머 본인 콘솔과 어드민 대행 콘솔(#71)이 같은 화면을 쓴다 —
 * 어드민이 무엇을 바꿨는지 스트리머에게도 그대로 보이는 것이 목적이다.
 * 어드민 「감사 기록」(#254)은 전체 채널을 필터로 훑고, 접근 기록(access.*)도 같은 목록에서 본다.
 */
export const auditRouter = t.router({
  logs: streamerProcedure
    .input(z.object({ cursor: z.number().int().positive().nullish(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.auditLog.findMany({
        where: { userId: ctx.user.id, ...(input.cursor ? { id: { lt: input.cursor } } : {}) },
        orderBy: { id: 'desc' },
        take: input.limit + 1,
      });
      const page = rows.slice(0, input.limit);
      //  행위자 표기: 본인 / 관리자(개인 식별 없이) / 채팅 호출자(닉네임·채널 id, 챗봇 명령일 때)
      return {
        logs: page.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          procedure: row.procedure,
          //  재귀적인 JsonValue 를 그대로 내리면 tRPC 타입 추론이 터진다(TS2589 실측) — 요약 문자열로
          inputText: row.input === null ? null : JSON.stringify(row.input),
          actorType: row.actorType,
          actorLabel:
            row.actorType === 'ADMIN' ? '관리자'
            : row.actorType === 'CHATBOT' ? `채팅 · ${row.actorName ?? '(알 수 없음)'}`
            : row.actorType === 'AGENT' ? `에이전트${row.actorName ? ` · ${row.actorName}` : ''}`
            : '본인',
        })),
        nextCursor: rows.length > input.limit ? page[page.length - 1]?.id ?? null : null,
      };
    }),

  /**
   * 어드민 감사 기록 (#254) — 전체 채널의 변경·접근 기록. 채널·행위자·종류(변경/접근)·경로·기간 필터.
   * 어드민 화면이므로 어떤 관리자인지(이메일)까지 보인다 — 스트리머 화면의 「관리자」 익명 표기와 다르다.
   */
  adminLogs: adminProcedure
    .input(
      z.object({
        cursor: z.number().int().positive().nullish(),
        limit: z.number().int().min(1).max(100).default(50),
        /** 대상 스트리머 (User.id) */
        userId: z.number().int().positive().optional(),
        actorType: z.enum(AUDIT_ACTORS).optional(),
        /** 변경 기록만 / 접근 기록만. procedure 를 지정하면 무시된다 */
        kind: z.enum(['change', 'access']).optional(),
        procedure: z.string().max(100).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.AuditLogWhereInput = {
        ...(input.cursor ? { id: { lt: input.cursor } } : {}),
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.actorType ? { actorType: input.actorType } : {}),
        ...(input.procedure
          ? { procedure: input.procedure }
          : input.kind === 'access'
            ? { procedure: { startsWith: ACCESS_PREFIX } }
            : input.kind === 'change'
              ? { NOT: { procedure: { startsWith: ACCESS_PREFIX } } }
              : {}),
        ...(input.from || input.to
          ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
          : {}),
      };
      const rows = await ctx.prisma.auditLog.findMany({
        where,
        orderBy: { id: 'desc' },
        take: input.limit + 1,
        include: { user: { select: { id: true, channelId: true, channelName: true } } },
      });
      const page = rows.slice(0, input.limit);

      //  관리자 행위자는 이메일로 식별한다 — 지워진 계정은 id 만 남는다
      const adminIds = [...new Set(page.filter((row) => row.actorType === 'ADMIN' && row.actorId != null).map((row) => row.actorId as number))];
      const admins = adminIds.length > 0
        ? await ctx.prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } })
        : [];
      const adminEmail = new Map(admins.map((admin) => [admin.id, admin.email]));

      return {
        logs: page.map((row) => ({
          id: row.id,
          createdAt: row.createdAt,
          procedure: row.procedure,
          inputText: row.input === null ? null : JSON.stringify(row.input),
          actorType: row.actorType,
          actorLabel:
            row.actorType === 'ADMIN' ? `관리자 · ${row.actorId != null ? adminEmail.get(row.actorId) ?? `#${row.actorId} (삭제됨)` : '(알 수 없음)'}`
            : row.actorType === 'CHATBOT' ? `채팅 · ${row.actorName ?? '(알 수 없음)'}`
            : row.actorType === 'AGENT' ? `에이전트${row.actorName ? ` · ${row.actorName}` : ''}`
            : '스트리머 본인',
          /** 대상 스트리머. 어드민 로그인처럼 대상이 없거나 탈퇴한 경우 null */
          channel: row.user ? { userId: row.user.id, channelId: row.user.channelId, channelName: row.user.channelName } : null,
        })),
        nextCursor: rows.length > input.limit ? page[page.length - 1]?.id ?? null : null,
      };
    }),

  /**
   * 어드민 대행 시작/종료 기록 (#254). 대행 쿠키는 웹 라우트(enter/exit)가 심고 지우므로 API 는 모른다 —
   * 그 라우트가 여기로 알려 준다. 스트리머도 자기 「변경 기록」에서 이 행을 본다 (대행 자체를 숨기지 않는다).
   */
  recordActing: adminProcedure
    .input(z.object({ userId: z.number().int().positive(), phase: z.enum(['start', 'end']) }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } });
      if (!target) throw new ServiceError('NOT_FOUND', '스트리머를 찾을 수 없습니다.');
      await accessLogService.recordAccess(ctx.prisma, {
        procedure: input.phase === 'start' ? 'access.actingStart' : 'access.actingEnd',
        actorType: 'ADMIN',
        actorId: ctx.user.id,
        userId: target.id,
      });
      return { ok: true as const };
    }),
});
