import { z } from 'zod';

import { wikiService } from '../services';
import { adminProcedure, internalProcedure, streamerProcedure, t } from '../trpc';

const sourceInput = z.object({
  name: z.string().trim().min(1).max(60),
  baseUrl: z.string().trim().max(200),
  enabled: z.boolean(),
  endsAt: z.coerce.date().nullable(),
  maxPages: z.number().int().min(1).max(500),
  viewerCooldownMinutes: z.number().int().min(0).max(1440),
  perChannelDaily: z.number().int().min(0).max(100_000),
  globalDaily: z.number().int().min(0).max(1_000_000),
});

/** 위키 기반 질의응답 (#309) — 소스·수집은 어드민, 주기 수집은 워커 */
export const wikiRouter = t.router({
  /** 스트리머가 명령어에 연결할 수 있는 소스 — 켜져 있고 종료 전인 것만 */
  listActive: streamerProcedure.query(({ ctx }) => wikiService.listActiveSources(ctx.prisma)),
  sources: adminProcedure.query(async ({ ctx }) => {
    const rows = await wikiService.listSources(ctx.prisma);
    return rows.map((row) => ({ ...row, crawling: wikiService.isCrawling(row.id) }));
  }),
  saveSource: adminProcedure
    .input(sourceInput.extend({ id: z.number().int().positive().nullable() }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return wikiService.saveSource(ctx.prisma, id, data);
    }),
  removeSource: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ ctx, input }) => wikiService.removeSource(ctx.prisma, input.id)),
  pages: adminProcedure
    .input(z.object({ sourceId: z.number().int().positive() }))
    .query(({ ctx, input }) => wikiService.listPages(ctx.prisma, input.sourceId)),
  /** 「지금 수집」 — 바로 돌려주고 뒤에서 돈다. 진행 여부는 sources 의 crawling */
  crawlNow: adminProcedure
    .input(z.object({ sourceId: z.number().int().positive() }))
    .mutation(({ ctx, input }) => wikiService.startCrawl(ctx.prisma, input.sourceId)),
  /** 챗봇 워커가 1시간마다 */
  crawlDue: internalProcedure.mutation(({ ctx }) => wikiService.crawlDue(ctx.prisma)),
});
