import { z } from 'zod';

import { t } from '../trpc';

export const chatbotRouter = t.router({
  getChannels: t.procedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      select: {
        id: true,
        channelId: true,
      },
    });
  }),
});
