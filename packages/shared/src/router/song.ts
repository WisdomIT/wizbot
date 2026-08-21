import { z } from 'zod';

import { playbackService, songService } from '../services';
import { publicProcedure, songSourceProcedure, streamerProcedure, t } from '../trpc';

const sourceTypeSchema = z.enum(['NONE', 'OBS', 'ELECTRON']);

export const songRouter = t.router({
  /* ── 스트리머 컨트롤러 ── */
  getState: streamerProcedure.query(async ({ ctx }) => {
    const [playback, queue, source] = await Promise.all([
      playbackService.getPlayback(ctx.prisma, ctx.user.id),
      songService.listQueue(ctx.prisma, ctx.user.id),
      playbackService.getSourceStatus(ctx.prisma, ctx.user.id),
    ]);
    return { playback, queue, source };
  }),

  play: streamerProcedure.mutation(({ ctx }) => playbackService.play(ctx.prisma, ctx.user.id)),
  pause: streamerProcedure.mutation(({ ctx }) => playbackService.pause(ctx.prisma, ctx.user.id)),
  stop: streamerProcedure.mutation(({ ctx }) => playbackService.stop(ctx.prisma, ctx.user.id)),
  next: streamerProcedure.mutation(({ ctx }) =>
    playbackService.skipToNext(ctx.prisma, ctx.user.id),
  ),
  setVolume: streamerProcedure
    .input(z.object({ volume: z.number().min(0).max(100) }))
    .mutation(({ ctx, input }) => playbackService.setVolume(ctx.prisma, ctx.user.id, input.volume)),
  setSourceType: streamerProcedure
    .input(z.object({ sourceType: sourceTypeSchema }))
    .mutation(({ ctx, input }) =>
      playbackService.setSourceType(ctx.prisma, ctx.user.id, input.sourceType),
    ),
  regenerateToken: streamerProcedure
    .input(z.object({ kind: z.enum(['source', 'overlay']) }))
    .mutation(({ ctx, input }) =>
      playbackService.regenerateSourceToken(ctx.prisma, ctx.user.id, input.kind),
    ),

  /* ── 송출 소스(OBS 페이지·앱) ── */
  /** 현재 무엇을 재생해야 하는지 + 이 세션이 활성인지 */
  sourceState: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.songSource) {
      return null;
    }
    const { userId } = ctx.songSource;
    const [playback, setting] = await Promise.all([
      playbackService.getPlayback(ctx.prisma, userId),
      ctx.prisma.userSetting.findUnique({ where: { userId } }),
    ]);
    return {
      playback,
      sourceType: setting?.songSourceType ?? 'NONE',
      readOnly: ctx.songSource.readOnly,
    };
  }),

  heartbeat: songSourceProcedure
    .input(z.object({ sessionId: z.string(), source: sourceTypeSchema }))
    .mutation(({ ctx, input }) => {
      playbackService.touchSourceSession(ctx.songSource.userId, input.source, input.sessionId);
      return { active: playbackService.isSessionActive(ctx.songSource.userId, input.sessionId) };
    }),

  reportEnded: songSourceProcedure.mutation(({ ctx }) =>
    playbackService.reportEnded(ctx.prisma, ctx.songSource.userId),
  ),
  reportFailed: songSourceProcedure.mutation(({ ctx }) =>
    playbackService.reportFailed(ctx.prisma, ctx.songSource.userId),
  ),
  reportPosition: songSourceProcedure
    .input(z.object({ positionSeconds: z.number().min(0) }))
    .mutation(({ ctx, input }) =>
      playbackService.reportPosition(ctx.prisma, ctx.songSource.userId, input.positionSeconds),
    ),
});
