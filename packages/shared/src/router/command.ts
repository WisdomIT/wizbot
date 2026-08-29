import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { chatbotFunctionDefinitionMap, isChatbotFunctionKey } from '../chatbot/definitions';
import { CHAT_MAX_LENGTH } from '../chatbot/lib';
import { commandService, repeatService, ServiceError } from '../services';
import { publicProcedure, streamerProcedure, t } from '../trpc';

/**
 * 봇이 그대로 내보내는 문구는 치지직 한도(100자)를 넘으면 전송 자체가 실패한다.
 * 저장 시점에 막아 「만들어 놨는데 반응이 없는」 상태를 없앤다 (#115).
 */
const chatMessage = z
  .string()
  .max(CHAT_MAX_LENGTH, `${CHAT_MAX_LENGTH}자까지 입력할 수 있습니다.`);

const permissionSchema = z.enum(['STREAMER', 'MANAGER', 'VIEWER']);
const commandTypeSchema = z.enum(['echo', 'function']);

function assertKnownFunction(func: string) {
  if (!isChatbotFunctionKey(func)) {
    throw new ServiceError('INVALID_INPUT', `"${func}"은(는) functions에 존재하지 않습니다.`);
  }
}

/**
 * 함수의 option 스펙 검증 (#22 — 클라이언트가 API 를 직접 호출하므로 서버에서 확정한다)
 * echoCommandSelect: 본인 소유 echo 명령어의 id 여야 한다
 */
async function assertValidOption(
  prisma: PrismaClient,
  userId: number,
  func: string,
  option: string | undefined,
) {
  if (!isChatbotFunctionKey(func)) return;
  const spec = chatbotFunctionDefinitionMap[func].option;
  if (!spec || spec.input !== 'echoCommandSelect') return;

  const id = Number(option);
  if (!option || !Number.isInteger(id)) {
    throw new ServiceError('INVALID_INPUT', `${spec.label}을(를) 선택해주세요.`);
  }
  await commandService.getEchoCommand(prisma, userId, id); // 없으면 NOT_FOUND
}

export const commandRouter = t.router({
  /** 시청자용 공개 명령어 목록 — 경로 식별자는 불변인 channelId (#72) */
  getCommandListByChannelId: publicProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ ctx, input }) => {
      // hidden 은 목록 노출 여부 — 직접 링크는 항상 접근 가능 (#7)
      const user = await ctx.prisma.user.findUnique({
        where: { channelId: input.channelId },
        select: { id: true },
      });
      if (!user) throw new ServiceError('NOT_FOUND', '존재하지 않는 채널입니다.');
      // 비활성 명령어는 시청자에게 노출하지 않는다 (#82)
      return commandService.listCommands(ctx.prisma, user.id, true);
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
    .input(z.object({ command: z.string(), response: chatMessage }))
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
      await assertValidOption(ctx.prisma, ctx.user.id, input.function, input.option);
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
        response: chatMessage.optional(),
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
        await assertValidOption(ctx.prisma, userId, input.function, input.option);
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

  /* ── 활성/비활성 토글 (#82) ── */
  setEnabled: streamerProcedure
    .input(z.object({ id: z.number(), type: commandTypeSchema, enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      commandService.setCommandEnabled(
        ctx.prisma,
        ctx.user.id,
        input.id,
        input.type,
        input.enabled,
      ),
    ),
  setRepeatEnabled: streamerProcedure
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) =>
      repeatService.setRepeatEnabled(ctx.prisma, ctx.user.id, input.id, input.enabled),
    ),

  getRepeatById: streamerProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => repeatService.getRepeat(ctx.prisma, ctx.user.id, input.id)),

  createRepeat: streamerProcedure
    .input(z.object({ response: chatMessage, interval: z.number() }))
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
    .input(z.object({ id: z.number(), response: chatMessage, interval: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await repeatService.updateRepeat(ctx.prisma, { userId: ctx.user.id, ...input });
      return { ok: true };
    }),
});
