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
      return { ok: true, message: `${name} 명령어가 생성되었습니다.` };
    }),

  deleteCommandEcho: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const name = commandService.normalizeCommandName(splitContent(content, query.command, 1)[0]);

      if (await commandService.findFunctionCommandByName(ctx.prisma, userId, name)) {
        return {
          ok: true,
          message: 'function 명령어는 삭제할 수 없습니다. 사이트를 통해 삭제해주세요.',
        };
      }

      const echo = await commandService.findEchoCommandByName(ctx.prisma, userId, name);
      if (!echo) return { ok: true, message: '존재하지 않는 명령어입니다.' };

      await commandService.deleteEchoCommand(ctx.prisma, userId, echo.id);
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
          message: 'function 명령어는 수정할 수 없습니다. 사이트를 통해 수정해주세요.',
        };
      }

      const echo = await commandService.findEchoCommandByName(ctx.prisma, userId, name);
      if (!echo) return { ok: true, message: '존재하지 않는 명령어입니다.' };

      await commandService.updateEchoCommand(ctx.prisma, { userId, id: echo.id, response });
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

      return {
        ok: true,
        message: `반복 출력 메시지가 생성되었습니다. 반복:${setting.chatbotDefaultRepeat}초 id: ${repeat.id}`,
      };
    }),

  deleteChatbotRepeat: async (ctx, data) =>
    withServiceMessages(async () => {
      const { content, query, userId } = data;
      const [target] = splitContent(content, query.command, 1);

      if (!target) {
        return {
          ok: true,
          message: `삭제할 반복 메시지의 id를 입력하거나, all 옵션을 입력해주세요. 예) !${query.command} <id> or all`,
        };
      }

      if (target === 'all') {
        await repeatService.deleteAllRepeats(ctx.prisma, userId);
        return { ok: true, message: '유저의 모든 반복 메시지가 삭제되었습니다.' };
      }

      const repeat = await repeatService.deleteRepeat(ctx.prisma, userId, Number(target));
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
