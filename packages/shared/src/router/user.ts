import { z } from 'zod';

import { t } from '../trpc';

export const userRouter = t.router({
  getLogServer: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findFirst();
  }),
});
