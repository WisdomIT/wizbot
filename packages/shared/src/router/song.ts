import { publicProcedure, t } from '../trpc';

export const songRouter = t.router({
  getSong: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.song.findFirst();
  }),
});
