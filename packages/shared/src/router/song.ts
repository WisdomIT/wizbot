import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { playbackService, ServiceError, songFavoriteService, songHistoryService, songService, userSettingService } from '../services';
import { publicProcedure, songSourceProcedure, streamerProcedure, t } from '../trpc';

const sourceTypeSchema = z.enum(['NONE', 'OBS', 'ELECTRON']);

/** 송출 소스가 재생을 맞추는 데 필요한 전부 — sourceState 와 heartbeat 가 같은 값을 돌려준다 */
async function loadSourceState(
  prisma: PrismaClient,
  userId: number,
  readOnly: boolean,
) {
  const [playback, setting] = await Promise.all([
    playbackService.getPlayback(prisma, userId),
    prisma.userSetting.findUnique({ where: { userId } }),
  ]);

  return {
    playback,
    sourceType: setting?.songSourceType ?? ('NONE' as const),
    readOnly,
    overlay: {
      mode: setting?.songOverlayMode ?? ('ALWAYS' as const),
      durationSeconds: setting?.songOverlayDurationSeconds ?? 10,
    },
  };
}

export const songRouter = t.router({
  /* ── 스트리머 컨트롤러 ── */
  getState: streamerProcedure.query(async ({ ctx }) => {
    const [playback, queue, source, setting] = await Promise.all([
      playbackService.getPlayback(ctx.prisma, ctx.user.id),
      songService.listQueue(ctx.prisma, ctx.user.id),
      playbackService.getSourceStatus(ctx.prisma, ctx.user.id),
      ctx.prisma.userSetting.findUnique({
        where: { userId: ctx.user.id },
        select: {
          songHistoryPublic: true,
          songAutoPlayFromDefault: true,
          songMaxPerRequester: true,
          songMaxQueueLength: true,
          songKeyboardShortcut: true,
          songShortcutPlayPause: true,
          songShortcutStop: true,
          songShortcutNext: true,
        },
      }),
    ]);
    return {
      playback,
      queue,
      source,
      historyPublic: setting?.songHistoryPublic ?? false,
      autoPlay: setting?.songAutoPlayFromDefault ?? false,
      /** 신청 제한 (#237) — maxPerRequester null 은 무제한 */
      requestPolicy: {
        maxPerRequester: setting === null ? 1 : setting.songMaxPerRequester,
        maxQueueLength: setting?.songMaxQueueLength ?? 30,
      },
      /** 앱의 전역 단축키 사용 여부 (#85) */
      keyboardShortcut: setting?.songKeyboardShortcut ?? true,
      shortcuts: {
        playPause:
          setting?.songShortcutPlayPause ?? playbackService.DEFAULT_SONG_SHORTCUTS.playPause,
        stop: setting?.songShortcutStop ?? playbackService.DEFAULT_SONG_SHORTCUTS.stop,
        next: setting?.songShortcutNext ?? playbackService.DEFAULT_SONG_SHORTCUTS.next,
      },
    };
  }),

  play: streamerProcedure.mutation(({ ctx }) => playbackService.play(ctx.prisma, ctx.user.id)),
  pause: streamerProcedure.mutation(({ ctx }) => playbackService.pause(ctx.prisma, ctx.user.id)),
  /** 단축키용 — 서버가 지금 상태를 보고 뒤집는다 (#85) */
  togglePlay: streamerProcedure.mutation(({ ctx }) =>
    playbackService.togglePlay(ctx.prisma, ctx.user.id),
  ),
  stop: streamerProcedure.mutation(({ ctx }) => playbackService.stop(ctx.prisma, ctx.user.id)),
  next: streamerProcedure.mutation(({ ctx }) =>
    playbackService.skipToNext(ctx.prisma, ctx.user.id),
  ),
  /** 전역 단축키 조합 변경 (#85) */
  setShortcuts: streamerProcedure
    .input(
      z.object({
        playPause: z.string().max(64),
        stop: z.string().max(64),
        next: z.string().max(64),
      }),
    )
    .mutation(({ ctx, input }) => playbackService.setShortcuts(ctx.prisma, ctx.user.id, input)),

  setRepeat: streamerProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      playbackService.setRepeatOne(ctx.prisma, ctx.user.id, input.enabled),
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

  setOverlaySettings: streamerProcedure
    .input(
      z.object({
        mode: z.enum(['ALWAYS', 'TIMED']),
        durationSeconds: z.number().int().min(1).max(60),
      }),
    )
    .mutation(({ ctx, input }) =>
      playbackService.setOverlaySettings(ctx.prisma, ctx.user.id, input),
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
  reorderQueue: streamerProcedure
    .input(z.object({ orderedIds: z.array(z.number()) }))
    .mutation(({ ctx, input }) =>
      songService.reorderQueue(ctx.prisma, ctx.user.id, input.orderedIds),
    ),
  clearQueue: streamerProcedure.mutation(async ({ ctx }) => {
    const me = await ctx.prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { channelName: true },
    });
    return songService.clearQueue(ctx.prisma, ctx.user.id, me?.channelName ?? '스트리머');
  }),
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

  /** 지금 재생 중인 곡을 즐겨찾기에 담는다 (#5 3단계) */
  addCurrentToFavorite: streamerProcedure
    .input(z.object({ favoriteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const playback = await playbackService.getPlayback(ctx.prisma, ctx.user.id);
      if (!playback.youtubeId) {
        throw new ServiceError('NOT_FOUND', '재생 중인 곡이 없습니다.');
      }
      return songFavoriteService.addFavoriteItem(
        ctx.prisma,
        ctx.user.id,
        input.favoriteId,
        playback.youtubeId,
      );
    }),

  /* ── 재생 기록 (#5 4단계) ── */
  history: streamerProcedure
    .input(
      z.object({
        cursor: z.number().optional(),
        status: z.enum(['PLAYED', 'SKIPPED', 'CANCELED', 'FAILED']).optional(),
        query: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) => songHistoryService.listHistory(ctx.prisma, ctx.user.id, input)),

  setHistoryHidden: streamerProcedure
    .input(z.object({ id: z.number(), hidden: z.boolean() }))
    .mutation(({ ctx, input }) =>
      songHistoryService.setHistoryHidden(ctx.prisma, ctx.user.id, input.id, input.hidden),
    ),

  setHistoryPublic: streamerProcedure
    .input(z.object({ isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.userSetting.update({
        where: { userId: ctx.user.id },
        data: { songHistoryPublic: input.isPublic },
      });
      return { ok: true as const };
    }),

  /** 신청 제한 (#237) — 1인당 곡 수(null=무제한)·대기열 상한(최대 100) */
  setRequestPolicy: streamerProcedure
    .input(
      z.object({
        maxPerRequester: z.number().int().min(1).max(99).nullable(),
        maxQueueLength: z.number().int().min(1).max(100),
      }),
    )
    .mutation(({ ctx, input }) =>
      userSettingService.updateUserSetting(ctx.prisma, ctx.user.id, {
        songMaxPerRequester: input.maxPerRequester,
        songMaxQueueLength: input.maxQueueLength,
      }),
    ),

  /** 기록에 있는 곡을 대기열에 다시 올린다 — 신청자 이름은 원래 신청자로 남긴다 */
  requeueFromHistory: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await songHistoryService.getHistoryEntry(ctx.prisma, ctx.user.id, input.id);
      const { song } = await songService.requestSong(
        ctx.prisma,
        ctx.user.id,
        entry.youtubeId,
        { nickname: entry.requester, channelId: entry.requesterChannelId },
        { bypassPolicy: true },
      );
      return song;
    }),

  /* ── 시청자 공개 (#5 4단계) ── */
  publicPlaylist: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .query(({ ctx, input }) =>
      songHistoryService.getPublicPlaylist(ctx.prisma, input.channelId),
    ),

  /** 시청자 하단 재생 바 — 현재 곡만 (#97) */
  publicNowPlaying: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .query(({ ctx, input }) =>
      songHistoryService.getPublicNowPlaying(ctx.prisma, input.channelId),
    ),

  publicHistory: publicProcedure
    .input(z.object({ channelId: z.string(), cursor: z.number().optional() }))
    .query(({ ctx, input }) =>
      songHistoryService.getPublicHistory(ctx.prisma, input.channelId, { cursor: input.cursor }),
    ),

  /* ── 송출 소스(OBS 페이지·앱) ── */
  /** 현재 무엇을 재생해야 하는지 + 이 세션이 활성인지 */
  sourceState: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.songSource) {
      return null;
    }
    return loadSourceState(ctx.prisma, ctx.songSource.userId, ctx.songSource.readOnly);
  }),

  /**
   * 하트비트 — 응답에 재생 상태를 함께 실어 보낸다.
   * 송출 소스는 어차피 5초마다 이걸 부르므로, 요청을 늘리지 않고도 5초마다 전체 대조가 된다.
   * (SSE 는 유실될 수 있고 재전송 장치가 없어서, 이 응답이 어긋남을 되돌리는 마지막 보루다)
   */
  heartbeat: songSourceProcedure
    .input(z.object({ sessionId: z.string(), source: sourceTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      const { userId, readOnly } = ctx.songSource;
      const state = await loadSourceState(ctx.prisma, userId, readOnly);

      // 지정된 소스가 아닌 창의 하트비트는 무시한다.
      // OBS 페이지와 앱을 함께 열어두면 두 창이 같은 자리를 번갈아 덮어써서
      // 연결 상태가 「연결됨 ↔ 연결 안 됨」으로 깜빡였다 (#85).
      if (state.sourceType !== input.source) {
        return { active: false, state };
      }

      playbackService.touchSourceSession(userId, input.source, input.sessionId);

      return {
        active: playbackService.isSessionActive(userId, input.sessionId),
        state,
      };
    }),

  reportEnded: songSourceProcedure.mutation(({ ctx }) =>
    playbackService.reportEnded(ctx.prisma, ctx.songSource.userId),
  ),
  reportFailed: songSourceProcedure.mutation(({ ctx }) =>
    playbackService.reportFailed(ctx.prisma, ctx.songSource.userId),
  ),
  reportPosition: songSourceProcedure
    // youtubeId 를 함께 받아 지난 곡의 보고를 걸러낸다 (#122)
    .input(z.object({ positionSeconds: z.number().min(0), youtubeId: z.string() }))
    .mutation(({ ctx, input }) =>
      playbackService.reportPosition(
        ctx.prisma,
        ctx.songSource.userId,
        input.positionSeconds,
        input.youtubeId,
      ),
    ),
});
