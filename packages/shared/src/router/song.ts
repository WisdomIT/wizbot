import { execSync } from 'child_process';
import { z } from 'zod';

import { t } from '../trpc';

export const songRouter = t.router({
  getSong: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.song.findFirst();
  }),
});
