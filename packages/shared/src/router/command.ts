import { z } from 'zod';

import { isChatbotFunctionKey } from '../chatbot/definitions';
import { commandService, repeatService, ServiceError } from '../services';
import { publicProcedure, streamerProcedure, t } from '../trpc';

const permissionSchema = z.enum(['STREAMER', 'MANAGER', 'VIEWER']);
const commandTypeSchema = z.enum(['echo', 'function']);

function assertKnownFunction(func: string) {
  if (!isChatbotFunctionKey(func)) {
    throw new ServiceError('INVALID_INPUT', `"${func}"은(는) functions에 존재하지 않습니다.`);
  }
}

export const commandRouter = t.router({
  /** 시청자용 공개 명령어 목록 (채널명 기준) */
  getCommandListByChannelName: publicProcedure
    .input(z.object({ channelName: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findFirst({
        where: { channelName: input.channelName, hidden: false },
        select: { id: true },
      });
      if (!user) throw new ServiceError('NOT_FOUND', '존재하지 않는 채널입니다.');
      return commandService.listCommands(ctx.prisma, user.id);
    }),

  getCommandList: streamerProcedure.query(({ ctx }) =>
    commandService.listCommands(ctx.prisma, ctx.user.id),
  ),

  getCommandById: streamerProcedure
    .input(z.object({ id: z.number(), type: commandTypeSchema }))
    .query(async ({ ctx, input }) => {
      const { id, type } = input;
      if (type === 'echo') {
        const found = await commandService.getEchoCommand(ctx.prisma, ctx.user.id, id);
        return { type: 'echo' as const, ...found };
      }
      const found = await commandService.getFunctionCommand(ctx.prisma, ctx.user.id, id);
      return { type: 'function' as const, ...found };
    }),

  createCommandEcho: streamerProcedure
    .input(z.object({ command: z.string(), response: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const data = await commandService.createEchoCommand(ctx.prisma, {
        userId: ctx.user.id,
        ...input,
      });
      return { ok: true, data };
    }),

  createCommandFunction: streamerProcedure
    .input(
      z.object({
        command: z.string(),
        permission: permissionSchema,
        function: z.string(),
        option: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertKnownFunction(input.function);
      const data = await commandService.createFunctionCommand(ctx.prisma, {
        userId: ctx.user.id,
        ...input,
      });
      return { ok: true, data };
    }),

  deleteCommand: streamerProcedure
    .input(z.object({ id: z.number(), type: commandTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      await commandService.deleteCommand(ctx.prisma, ctx.user.id, input.id, input.type);
      return { ok: true };
    }),

  updateCommand: streamerProcedure
    .input(
      z.object({
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
      const userId = ctx.user.id;
      const { id, type, command } = input;

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

  getRepeatList: streamerProcedure.query(({ ctx }) =>
    repeatService.listRepeats(ctx.prisma, ctx.user.id),
  ),

  getRepeatById: streamerProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => repeatService.getRepeat(ctx.prisma, ctx.user.id, input.id)),

  createRepeat: streamerProcedure
    .input(z.object({ response: z.string(), interval: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const data = await repeatService.createRepeat(ctx.prisma, { userId: ctx.user.id, ...input });
      return { ok: true, data };
    }),

  deleteRepeat: streamerProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await repeatService.deleteRepeat(ctx.prisma, ctx.user.id, input.id);
      return { ok: true };
    }),

  updateRepeat: streamerProcedure
    .input(z.object({ id: z.number(), response: z.string(), interval: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await repeatService.updateRepeat(ctx.prisma, { userId: ctx.user.id, ...input });
      return { ok: true };
    }),
});
