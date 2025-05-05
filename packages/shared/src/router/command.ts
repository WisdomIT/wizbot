import { z } from 'zod';

import { functions } from '../chatbot';
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
  createCommandEcho: t.procedure
    .input(
      z.object({
        userId: z.number(),
        command: z.string(),
        response: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, command, response } = input;

      if (!userId || !command || !response) {
        return {
          ok: false,
          message: 'Invalid input',
        };
      }

      const findCommand = await ctx.prisma.chatbotEchoCommand.findFirst({
        where: {
          userId,
          command,
        },
      });

      if (findCommand) {
        throw new Error('이미 존재하는 명령어입니다.');
      }

      const findCommand2 = await ctx.prisma.chatbotFunctionCommand.findFirst({
        where: {
          userId,
          command,
        },
      });

      if (findCommand2) {
        throw new Error('이미 존재하는 명령어입니다.');
      }

      const create = await ctx.prisma.chatbotEchoCommand.create({
        data: {
          userId,
          command,
          response,
        },
      });

      return {
        ok: true,
        data: create,
      };
    }),
  createCommandFunction: t.procedure
    .input(
      z.object({
        userId: z.number(),
        command: z.string(),
        permission: z.enum(['STREAMER', 'MANAGER', 'VIEWER']),
        function: z.string(),
        option: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, command, permission, function: func, option } = input;

      if (!userId || !command || !permission || !func) {
        return {
          ok: false,
          message: 'Invalid input',
        };
      }

      const findCommand = await ctx.prisma.chatbotFunctionCommand.findFirst({
        where: {
          userId,
          command,
        },
      });

      if (findCommand) {
        throw new Error('이미 존재하는 명령어입니다.');
      }

      const findCommand2 = await ctx.prisma.chatbotEchoCommand.findFirst({
        where: {
          userId,
          command,
        },
      });

      if (findCommand2) {
        throw new Error('이미 존재하는 명령어입니다.');
      }

      const thisFunction = functions[func];
      if (!thisFunction) {
        throw new Error('존재하지 않는 기능입니다.');
      }

      const create = await ctx.prisma.chatbotFunctionCommand.create({
        data: {
          userId,
          command,
          permission,
          function: func,
          option,
        },
      });

      return {
        ok: true,
        data: create,
      };
    }),
});
