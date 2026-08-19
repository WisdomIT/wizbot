import { z } from 'zod';

import { functions } from '../chatbot';
import { commandService, repeatService, ServiceError } from '../services';
import { t } from '../trpc';

const permissionSchema = z.enum(['STREAMER', 'MANAGER', 'VIEWER']);
const commandTypeSchema = z.enum(['echo', 'function']);

function assertKnownFunction(func: string) {
  if (!(func in functions)) {
    throw new ServiceError('INVALID_INPUT', `"${func}"은(는) functions에 존재하지 않습니다.`);
  }
}

export const commandRouter = t.router({
  getCommandList: t.procedure
    .input(z.object({ userId: z.number() }))
    .query(({ ctx, input }) => commandService.listCommands(ctx.prisma, input.userId)),

  getCommandById: t.procedure
    .input(z.object({ userId: z.number(), id: z.number(), type: commandTypeSchema }))
    .query(async ({ ctx, input }) => {
      const { userId, id, type } = input;
      if (type === 'echo') {
        const found = await commandService.getEchoCommand(ctx.prisma, userId, id);
        return { type: 'echo' as const, ...found };
      }
      const found = await commandService.getFunctionCommand(ctx.prisma, userId, id);
      return { type: 'function' as const, ...found };
    }),

  createCommandEcho: t.procedure
    .input(z.object({ userId: z.number(), command: z.string(), response: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const data = await commandService.createEchoCommand(ctx.prisma, input);
      return { ok: true, data };
    }),

  createCommandFunction: t.procedure
    .input(
      z.object({
        userId: z.number(),
        command: z.string(),
        permission: permissionSchema,
        function: z.string(),
        option: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertKnownFunction(input.function);
      const data = await commandService.createFunctionCommand(ctx.prisma, input);
      return { ok: true, data };
    }),

  deleteCommand: t.procedure
    .input(z.object({ userId: z.number(), id: z.number(), type: commandTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      await commandService.deleteCommand(ctx.prisma, input.userId, input.id, input.type);
      return { ok: true };
    }),

  updateCommand: t.procedure
    .input(
      z.object({
        userId: z.number(),
        id: z.number(),
        type: commandTypeSchema,
        command: z.string(),
        response: z.string().optional(),
        permission: permissionSchema.optional(),
        function: z.string().optional(),
        option: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, id, type, command } = input;

      if (type === 'echo') {
        if (!input.response) throw new ServiceError('INVALID_INPUT', '응답을 입력해주세요.');
        await commandService.updateEchoCommand(ctx.prisma, {
          userId,
          id,
          command,
          response: input.response,
        });
      } else {
        if (!input.permission || !input.function) {
          throw new ServiceError('INVALID_INPUT', '권한과 기능을 입력해주세요.');
        }
        assertKnownFunction(input.function);
        await commandService.updateFunctionCommand(ctx.prisma, {
          userId,
          id,
          command,
          permission: input.permission,
          function: input.function,
          option: input.option,
        });
      }

      return { ok: true };
    }),

  getRepeatList: t.procedure
    .input(z.object({ userId: z.number() }))
    .query(({ ctx, input }) => repeatService.listRepeats(ctx.prisma, input.userId)),

  getRepeatById: t.procedure
    .input(z.object({ userId: z.number(), id: z.number() }))
    .query(({ ctx, input }) => repeatService.getRepeat(ctx.prisma, input.userId, input.id)),

  createRepeat: t.procedure
    .input(z.object({ userId: z.number(), response: z.string(), interval: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const data = await repeatService.createRepeat(ctx.prisma, input);
      return { ok: true, data };
    }),

  deleteRepeat: t.procedure
    .input(z.object({ userId: z.number(), id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await repeatService.deleteRepeat(ctx.prisma, input.userId, input.id);
      return { ok: true };
    }),

  updateRepeat: t.procedure
    .input(
      z.object({ userId: z.number(), id: z.number(), response: z.string(), interval: z.number() }),
    )
    .mutation(async ({ ctx, input }) => {
      await repeatService.updateRepeat(ctx.prisma, input);
      return { ok: true };
    }),
});
