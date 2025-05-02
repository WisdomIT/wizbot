import chzzk from '../chzzk';
import { FunctionCommand } from '.';
import { splitContent } from './lib';

export const functionCommand = {
  createCommandEcho: async (ctx, data) => {
    const { content, query } = data;

    const splittedContent = splitContent(content, query.command, 2);
    const commandName = splittedContent[0];
    const commandResponse = splittedContent[1];

    if (commandName === '') {
      return {
        ok: true,
        message: '추가할 명령어와 응답을 입력해주세요. 예) !추가 멤버 빅헤드 마뫄 양아지',
      };
    }

    if (!commandName || !commandResponse) {
      return {
        ok: false,
        message: '비정상적인 메시지입니다.',
      };
    }

    if (commandResponse === '') {
      return {
        ok: true,
        message: '봇이 응답할 메시지를 함께 입력해주세요.',
      };
    }

    const findCommand = await ctx.prisma.chatbotEchoCommand.findFirst({
      where: {
        userId: data.userId,
        command: commandName,
      },
    });

    if (findCommand) {
      return {
        ok: true,
        message: '이미 존재하는 명령어입니다.',
      };
    }

    await ctx.prisma.chatbotEchoCommand.create({
      data: {
        userId: data.userId,
        command: commandName,
        response: commandResponse,
      },
    });

    return {
      ok: true,
      message: `${commandName} 명령어가 생성되었습니다.`,
    };
  },
  deleteCommandEcho: async (ctx, data) => {
    const { content, query } = data;

    const splittedContent = splitContent(content, query.command, 1);
    const commandName = splittedContent[0];

    const findCommand = await ctx.prisma.chatbotEchoCommand.findFirst({
      where: {
        userId: data.userId,
        command: commandName,
      },
    });

    if (!findCommand) {
      return {
        ok: true,
        message: '존재하지 않는 명령어입니다.',
      };
    }

    await ctx.prisma.chatbotEchoCommand.delete({
      where: {
        id: findCommand.id,
      },
    });

    return {
      ok: true,
      message: `${commandName} 명령어가 삭제되었습니다.`,
    };
  },
  updateCommandEcho: async (ctx, data) => {
    const { content, query } = data;

    const splittedContent = splitContent(content, query.command, 2);
    const commandName = splittedContent[0];
    const commandResponse = splittedContent[1];

    if (commandName === '') {
      return {
        ok: true,
        message: '수정할 명령어와 응답을 입력해주세요. 예) !수정 멤버 빅헤드 마뫄 양아지',
      };
    }

    if (!commandName || !commandResponse) {
      return {
        ok: false,
        message: '비정상적인 메시지입니다.',
      };
    }

    if (commandResponse === '') {
      return {
        ok: true,
        message: '봇이 응답할 메시지를 함께 입력해주세요.',
      };
    }

    const findCommand = await ctx.prisma.chatbotEchoCommand.findFirst({
      where: {
        userId: data.userId,
        command: commandName,
      },
    });

    if (!findCommand) {
      return {
        ok: true,
        message: '존재하지 않는 명령어입니다.',
      };
    }

    await ctx.prisma.chatbotEchoCommand.update({
      where: {
        id: findCommand.id,
      },
      data: {
        response: commandResponse,
      },
    });

    return {
      ok: true,
      message: `${commandName} 명령어가 수정되었습니다.`,
    };
  },
} as FunctionCommand;
