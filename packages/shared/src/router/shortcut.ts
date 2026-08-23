import { z } from 'zod';

import { shortcutService } from '../services';
import { streamerProcedure, t } from '../trpc';

const shortcutInput = z.object({
  name: z.string(),
  url: z.string(),
  icon: z.string(),
});

/** 스트리머 바로가기 링크 (#7 A2) */
export const shortcutRouter = t.router({
  list: streamerProcedure.query(({ ctx }) =>
    shortcutService.listShortcuts(ctx.prisma, ctx.user.id),
  ),

  create: streamerProcedure
    .input(shortcutInput)
    .mutation(({ ctx, input }) =>
      shortcutService.createShortcut(ctx.prisma, { userId: ctx.user.id, ...input }),
    ),

  update: streamerProcedure
    .input(shortcutInput.extend({ id: z.number() }))
    .mutation(({ ctx, input }) =>
      shortcutService.updateShortcut(ctx.prisma, { userId: ctx.user.id, ...input }),
    ),

  delete: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) =>
      shortcutService.deleteShortcut(ctx.prisma, ctx.user.id, input.id),
    ),

  move: streamerProcedure
    .input(z.object({ id: z.number(), direction: z.enum(['up', 'down']) }))
    .mutation(({ ctx, input }) =>
      shortcutService.moveShortcut(ctx.prisma, ctx.user.id, input.id, input.direction),
    ),
});
