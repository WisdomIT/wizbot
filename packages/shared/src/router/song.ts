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

  /* ── 큐 편집 (#5 2-b) ── */
  addToQueue: streamerProcedure
    .input(z.object({ query: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const me = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { channelId: true, channelName: true },
      });
      // 스트리머 직접 추가는 시청자용 정책을 적용하지 않는다
      const { song } = await songService.requestSong(
        ctx.prisma,
        ctx.user.id,
        input.query,
        { nickname: me?.channelName ?? '스트리머', channelId: me?.channelId ?? null },
        { bypassPolicy: true },
      );
      return song;
    }),
  moveInQueue: streamerProcedure
    .input(z.object({ id: z.number(), direction: z.enum(['up', 'down']) }))
    .mutation(({ ctx, input }) =>
      songService.moveSong(ctx.prisma, ctx.user.id, input.id, input.direction),
    ),
  removeFromQueue: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const me = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { channelName: true },
      });
      return songService.removeSongById(
        ctx.prisma,
        ctx.user.id,
        input.id,
        me?.channelName ?? '스트리머',
      );
    }),
  playNow: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const me = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { channelName: true },
      });
      return playbackService.playSongNow(ctx.prisma, ctx.user.id, input.id, me?.channelName);
    }),
  seek: streamerProcedure
    .input(z.object({ positionSeconds: z.number().min(0) }))
    .mutation(({ ctx, input }) =>
      playbackService.seek(ctx.prisma, ctx.user.id, input.positionSeconds),
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
