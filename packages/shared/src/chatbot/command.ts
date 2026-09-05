import type { PrismaClient } from '@prisma/client';

import { chatActorName, sanitizeAuditInput } from '../lib/audit';
import { commandService, isServiceError, repeatService, userSettingService } from '../services';
import { ChabotReturn, ChatbotFunctionHandler } from '.';
import { splitContent } from './lib';

/**
 * 서비스 계층의 정책 오류(ServiceError)는 채팅 응답 메시지로 변환하고,
 * 그 외 예외는 그대로 던져 디스패처의 공통 처리('Function execution failed')로 넘긴다.
 */
async function withServiceMessages(fn: () => Promise<ChabotReturn>): Promise<ChabotReturn> {
  try {
    return await fn();
  } catch (error) {
    if (isServiceError(error)) return { ok: true, message: error.message };
    throw error;
  }
}

/**
 * 채팅으로 바꾼 것도 감사 로그에 남긴다 (#175) — streamerProcedure 를 지나지 않으므로 여기서 직접.
 * 누가 시켰는지(닉네임·채널 id)가 핵심이다. 기록 실패가 채팅 응답을 막으면 안 된다.
 */
async function recordChatAudit(
  prisma: PrismaClient,
  data: { userId: number; senderNickname: string; senderChannelId?: string },
  procedure: string,
  input: Record<string, unknown>,
) {
  try {
    const cleaned = sanitizeAuditInput(input);
    await prisma.auditLog.create({
      data: {
        userId: data.userId,
        actorType: 'CHATBOT',
        actorName: chatActorName(data),
        procedure,
        ...(cleaned === null ? {} : { input: cleaned }),
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[audit] 채팅 기록 실패:', procedure, error);
  }
}

/** "!명령 <이름> <응답>" 형태의 인수 파싱. 이름 앞의 '!'는 허용 */
function parseNameAndResponse(content: string, command: string) {
  const [rawName, response] = splitContent(content, command, 2);
  const name = commandService.normalizeCommandName(rawName ?? '');
  return { name, response };
}

export const functionCommand = {
  createCommandEcho: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const { name, response } = parseNameAndResponse(content, query.command);

      if (!name) {
        return {
          ok: true,
          message: `수정할 명령어와 응답을 입력해주세요. 예) !${query.command} <명령어 이름> <응답>`,
        };
      }
      if (!response) {
        return {
          ok: true,
          message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} ${name} <응답>`,
        };
      }

      await commandService.createEchoCommand(ctx.prisma, { userId, command: name, response });
      await recordChatAudit(ctx.prisma, data, 'chat.commandCreate', { command: name, response });
      return { ok: true, message: `${name} 명령어가 생성되었습니다.` };
    }),

  deleteCommandEcho: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const name = commandService.normalizeCommandName(splitContent(content, query.command, 1)[0]);

      if (await commandService.findFunctionCommandByName(ctx.prisma, userId, name)) {
        return {
          ok: true,
          message: '기능 명령어는 채팅으로 삭제할 수 없습니다. 사이트에서 삭제해주세요.',
        };
      }

      const echo = await commandService.findEchoCommandByName(ctx.prisma, userId, name);
      if (!echo) return { ok: true, message: '존재하지 않는 명령어입니다.' };

      await commandService.deleteEchoCommand(ctx.prisma, userId, echo.id);
      await recordChatAudit(ctx.prisma, data, 'chat.commandDelete', { command: name });
      return { ok: true, message: `${name} 명령어가 삭제되었습니다.` };
    }),

  updateCommandEcho: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const { name, response } = parseNameAndResponse(content, query.command);

      if (!name) {
        return {
          ok: true,
          message: `수정할 명령어와 응답을 입력해주세요. 예) !${query.command} <명령어 이름> <응답>`,
        };
      }
      if (!response) {
        return {
          ok: true,
          message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} ${name} <응답>`,
        };
      }

      if (await commandService.findFunctionCommandByName(ctx.prisma, userId, name)) {
        return {
          ok: true,
          message: '기능 명령어는 채팅으로 수정할 수 없습니다. 사이트에서 수정해주세요.',
        };
      }

      const echo = await commandService.findEchoCommandByName(ctx.prisma, userId, name);
      if (!echo) return { ok: true, message: '존재하지 않는 명령어입니다.' };

      await commandService.updateEchoCommand(ctx.prisma, { userId, id: echo.id, response });
      await recordChatAudit(ctx.prisma, data, 'chat.commandUpdate', { command: name, response });
      return { ok: true, message: `${name} 명령어가 수정되었습니다.` };
    }),

  updateSpecificCommandEcho: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const [response] = splitContent(content, query.command, 1);

      if (!response) {
        return {
          ok: true,
          message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} <응답>`,
        };
      }

      const echo = await commandService.getEchoCommand(ctx.prisma, userId, Number(query.option));
      await commandService.updateEchoCommand(ctx.prisma, { userId, id: echo.id, response });
      await recordChatAudit(ctx.prisma, data, 'chat.commandUpdate', { command: echo.command, response });
      return { ok: true, message: `${echo.command} 명령어가 수정되었습니다.` };
    }),

  createChatbotRepeat: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const [response] = splitContent(content, query.command, 1);

      if (!response) {
        return {
          ok: true,
          message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} <응답>`,
        };
      }

      const setting = await userSettingService.getUserSetting(ctx.prisma, userId);
      const repeat = await repeatService.createRepeat(ctx.prisma, {
        userId,
        response,
        interval: setting.chatbotDefaultRepeat,
      });
      await recordChatAudit(ctx.prisma, data, 'chat.repeatCreate', { id: repeat.id, response: repeat.response });

      return {
        ok: true,
        message: `반복 메시지를 추가했습니다. (${setting.chatbotDefaultRepeat}초마다 · 번호 ${repeat.id})`,
      };
    }),

  deleteChatbotRepeat: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const [target] = splitContent(content, query.command, 1);

      if (!target) {
        return {
          ok: true,
          message: `삭제할 반복 메시지의 번호를 입력해주세요. 전부 지우려면 all. 예) !${query.command} 3`,
        };
      }

      if (target === 'all') {
        await repeatService.deleteAllRepeats(ctx.prisma, userId);
        await recordChatAudit(ctx.prisma, data, 'chat.repeatDelete', { target: '전체' });
        return { ok: true, message: '반복 메시지를 모두 삭제했습니다.' };
      }

      const repeat = await repeatService.deleteRepeat(ctx.prisma, userId, Number(target));
      await recordChatAudit(ctx.prisma, data, 'chat.repeatDelete', { id: repeat.id, response: repeat.response });
      return { ok: true, message: `${repeat.response} 반복 메시지가 삭제되었습니다.` };
    }),
  getCommandListUrl: async (ctx, data) => {
    const siteUrl = process.env.PUBLIC_SITE_URL?.replace(/\/$/, '');
    if (!siteUrl) {
      // 미설정 시 깨진 링크를 내보내지 않는다 (#73)
      return { ok: false, message: 'PUBLIC_SITE_URL이 설정되지 않았습니다.' };
    }

    const user = await ctx.prisma.user.findUnique({
      where: { id: data.userId },
      select: { channelId: true },
    });
    if (!user) {
      return { ok: false, message: '사용자를 찾을 수 없습니다.' };
    }

    // 경로 식별자는 불변인 channelId (#72)
    return { ok: true, message: `명령어 목록: ${siteUrl}/${user.channelId}/command` };
  },
} satisfies Partial<Record<string, ChatbotFunctionHandler>>;
