import { z } from 'zod';

import { streamerProcedure, t } from '../trpc';

/**
 * 설정 변경 기록 조회 (#175). 스트리머 본인 콘솔과 어드민 대행 콘솔(#71)이 같은 화면을 쓴다 —
 * 어드민이 무엇을 바꿨는지 스트리머에게도 그대로 보이는 것이 목적이다.
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
            : row.actorType === 'AGENT' ? `도우미${row.actorName ? ` · ${row.actorName}` : ''}`
            : '본인',
        })),
        nextCursor: rows.length > input.limit ? page[page.length - 1]?.id ?? null : null,
      };
    }),
});
