import { z } from 'zod';

import { t } from '../trpc';

export const userRouter = t.router({
  getUser: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findFirst();
  }),
  getChzzkId: t.procedure.query(() => {
    return process.env.CHZZK_ID;
  }),
});
