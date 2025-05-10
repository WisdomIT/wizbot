import { ChatbotEchoCommand, ChatbotFunctionCommand } from '@prisma/client';
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
  getCommandById: t.procedure
    .input(
      z.object({
        userId: z.number(),
        id: z.number(),
        type: z.enum(['echo', 'function']),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { userId, id, type } = input;

      if (!userId || !id || !type) {
        throw new Error('Invalid input.');
      }

      if (type === 'echo') {
        const findCommand = await ctx.prisma.chatbotEchoCommand.findFirst({
          where: {
            userId,
            id,
          },
        });

        if (!findCommand) {
          throw new Error('Command not found');
        }

        return {
          type: 'echo' as const,
          ...findCommand,
        };
      } else if (type === 'function') {
        const findCommand = await ctx.prisma.chatbotFunctionCommand.findFirst({
          where: {
            userId,
            id,
          },
        });

        if (!findCommand) {
          throw new Error('Command not found');
        }

        return {
          type: 'function' as const,
          ...findCommand,
        };
      }

      throw new Error('Command not found');
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
      const { userId, response } = input;
      let { command } = input;

      if (!userId || !command || !response) {
        throw new Error('Invalid input.');
      }

      if (command.startsWith('!')) {
        command = command.slice(1);
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
      const { userId, permission, function: func, option } = input;
      let { command } = input;

      if (!userId || !command || !permission || !func) {
        throw new Error('Invalid input.');
      }

      if (command.startsWith('!')) {
        command = command.slice(1);
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

      if (!(func in functions)) {
        throw new Error(`"${func}"은(는) functions에 존재하지 않습니다.`);
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
  deleteCommand: t.procedure
    .input(
      z.object({
        userId: z.number(),
        id: z.number(),
        type: z.enum(['echo', 'function']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, id, type } = input;

      if (!userId || !id || !type) {
        throw new Error('Invalid input.');
      }

      if (type === 'echo') {
        await ctx.prisma.chatbotEchoCommand.deleteMany({
          where: {
            userId,
            id,
          },
        });
      } else if (type === 'function') {
        await ctx.prisma.chatbotFunctionCommand.deleteMany({
          where: {
            userId,
            id,
          },
        });
      }

      return {
        ok: true,
      };
    }),
  updateCommand: t.procedure
    .input(
      z.object({
        userId: z.number(),
        id: z.number(),
        type: z.enum(['echo', 'function']),
        command: z.string(),
        response: z.string().optional(),
        permission: z.enum(['STREAMER', 'MANAGER', 'VIEWER']).optional(),
        function: z.string().optional(),
        option: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, id, type, response, permission, function: func, option } = input;
      let { command } = input;

      if (!userId || !id || !type || !command) {
        throw new Error('Invalid input.');
      }

      if (command.startsWith('!')) {
        command = command.slice(1);
      }

      if (type === 'echo') {
        if (!response) {
          throw new Error('Invalid input.');
        }

        const findCommand = await ctx.prisma.chatbotEchoCommand.findFirst({
          where: {
            userId,
            id,
          },
        });
        if (!findCommand) {
          throw new Error('Command not found');
        }

        const findCommand2 = await ctx.prisma.chatbotEchoCommand.findFirst({
          where: {
            userId,
            command,
          },
        });
        if (findCommand2 && findCommand2.id !== id) {
          throw new Error('이미 존재하는 명령어입니다.');
        }

        await ctx.prisma.chatbotEchoCommand.update({
          where: {
            userId,
            id,
          },
          data: {
            command,
            response,
          },
        });
      } else if (type === 'function') {
        if (!permission || !func) {
          throw new Error('Invalid input.');
        }

        const findCommand = await ctx.prisma.chatbotFunctionCommand.findFirst({
          where: {
            userId,
            id,
          },
        });
        if (!findCommand) {
          throw new Error('Command not found');
        }

        const findCommand2 = await ctx.prisma.chatbotFunctionCommand.findFirst({
          where: {
            userId,
            command,
          },
        });
        if (findCommand2 && findCommand2.id !== id) {
          throw new Error('이미 존재하는 명령어입니다.');
        }

        await ctx.prisma.chatbotFunctionCommand.update({
          where: {
            userId,
            id,
          },
          data: {
            command,
            permission,
            function: func,
            option,
          },
        });
      }

      return {
        ok: true,
      };
    }),
  getRepeatList: t.procedure
    .input(
      z.object({
        userId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const findRepeat = await ctx.prisma.chatbotRepeat.findMany({
        where: {
          userId: input.userId,
        },
      });

      return findRepeat;
    }),
  getRepeatById: t.procedure
    .input(
      z.object({
        userId: z.number(),
        id: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { userId, id } = input;

      if (!userId || !id) {
        throw new Error('Invalid input.');
      }

      const findRepeat = await ctx.prisma.chatbotRepeat.findFirst({
        where: {
          userId,
          id,
        },
      });

      if (!findRepeat) {
        throw new Error('Repeat not found');
      }

      return findRepeat;
    }),
  createRepeat: t.procedure
    .input(
      z.object({
        userId: z.number(),
        response: z.string(),
        interval: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, response, interval } = input;

      if (!userId || !response || !interval) {
        throw new Error('Invalid input.');
      }

      const create = await ctx.prisma.chatbotRepeat.create({
        data: {
          userId,
          response,
          interval,
        },
      });

      return {
        ok: true,
        data: create,
      };
    }),
  deleteRepeat: t.procedure
    .input(
      z.object({
        userId: z.number(),
        id: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, id } = input;

      if (!userId || !id) {
        throw new Error('Invalid input.');
      }

      await ctx.prisma.chatbotRepeat.delete({
        where: {
          userId,
          id,
        },
      });

      return {
        ok: true,
      };
    }),
  updateRepeat: t.procedure
    .input(
      z.object({
        userId: z.number(),
        id: z.number(),
        response: z.string(),
        interval: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, id, response, interval } = input;

      if (!userId || !id || !response || !interval) {
        throw new Error('Invalid input.');
      }

      await ctx.prisma.chatbotRepeat.update({
        where: {
          userId,
          id,
        },
        data: {
          response,
          interval,
        },
      });

      return {
        ok: true,
      };
    }),
});
