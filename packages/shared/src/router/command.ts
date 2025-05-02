import { z } from 'zod';

import { t } from '../trpc';

export const commandRouter = t.router({
  getCommandList: t.procedure
    .input(
      z.object({
        userId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const echoFind = await ctx.prisma.chatbotEchoCommand.findMany({
        where: {
          userId: input.userId,
        },
      });
      const functionFind = await ctx.prisma.chatbotFunctionCommand.findMany({
        where: {
          userId: input.userId,
        },
      });
      return {
        echo: echoFind,
        function: functionFind,
      };
    }),
});
