import { z } from 'zod';

import { songFavoriteService } from '../services';
import { streamerProcedure, t } from '../trpc';

/** 즐겨찾기 = 미리 담아두는 재생목록 (#5 3단계) */
export const songFavoriteRouter = t.router({
  list: streamerProcedure.query(async ({ ctx }) => {
    const [favorites, setting] = await Promise.all([
      songFavoriteService.listFavorites(ctx.prisma, ctx.user.id),
      ctx.prisma.userSetting.findUnique({
        where: { userId: ctx.user.id },
        select: { songAutoPlayFromDefault: true },
      }),
    ]);
    return { favorites, autoPlay: setting?.songAutoPlayFromDefault ?? false };
  }),

  get: streamerProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => songFavoriteService.getFavorite(ctx.prisma, ctx.user.id, input.id)),

  create: streamerProcedure
    .input(z.object({ name: z.string().min(1).max(50) }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.createFavorite(ctx.prisma, ctx.user.id, input.name),
    ),
  rename: streamerProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(50) }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.renameFavorite(ctx.prisma, ctx.user.id, input.id, input.name),
    ),
  remove: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.deleteFavorite(ctx.prisma, ctx.user.id, input.id),
    ),
  setDefault: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.setDefaultFavorite(ctx.prisma, ctx.user.id, input.id),
    ),

  /** 대기열이 비었을 때 대표 즐겨찾기에서 이어 재생할지 */
  setAutoPlay: streamerProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.userSetting.update({
        where: { userId: ctx.user.id },
        data: { songAutoPlayFromDefault: input.enabled },
      });
      return { ok: true as const };
    }),

  /* ── 곡 ── */
  /** 담기 전 확인용 조회 (#97) */
  previewItem: streamerProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(({ input }) => songFavoriteService.previewItem(input.query)),
  previewPlaylist: streamerProcedure
    .input(z.object({ url: z.string().min(1) }))
    .query(({ input }) => songFavoriteService.previewPlaylist(input.url)),

  addItem: streamerProcedure
    .input(z.object({ id: z.number(), query: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.addFavoriteItem(ctx.prisma, ctx.user.id, input.id, input.query),
    ),
  importPlaylist: streamerProcedure
    .input(z.object({ id: z.number(), url: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.importPlaylist(ctx.prisma, ctx.user.id, input.id, input.url),
    ),
  removeItem: streamerProcedure
    .input(z.object({ id: z.number(), itemId: z.number() }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.removeFavoriteItem(ctx.prisma, ctx.user.id, input.id, input.itemId),
    ),
  clearItems: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.clearFavoriteItems(ctx.prisma, ctx.user.id, input.id),
    ),
  reorderItems: streamerProcedure
    .input(z.object({ id: z.number(), orderedIds: z.array(z.number()) }))
    .mutation(({ ctx, input }) =>
      songFavoriteService.reorderFavoriteItems(
        ctx.prisma,
        ctx.user.id,
        input.id,
        input.orderedIds,
      ),
    ),

  /** 대기열 뒤에 붙이기 */
  enqueue: streamerProcedure
    .input(z.object({ id: z.number(), shuffle: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      const me = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { channelName: true },
      });
      return songFavoriteService.enqueueFavorite(ctx.prisma, ctx.user.id, input.id, {
        shuffle: input.shuffle,
        requester: me?.channelName ?? '스트리머',
      });
    }),
});
