import chzzk from '../chzzk';
import { FunctionCommand } from '.';
import { splitContent } from './lib';

export const functionCommand = {
  createCommandEcho: async (ctx, data) => {
    const { content, query } = data;

    const splittedContent = splitContent(content, query.command, 2);
    let commandName = splittedContent[0];
    if (commandName.startsWith('!')) {
      commandName = commandName.slice(1);
    }
    const commandResponse = splittedContent[1];

    if (!commandName) {
      return {
        ok: true,
        message: `수정할 명령어와 응답을 입력해주세요. 예) !${query.command} <명령어 이름> <응답>`,
      };
    }

    if (!commandResponse) {
      return {
        ok: true,
        message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} ${commandName} <응답>`,
      };
    }

    if (!commandName || !commandResponse) {
      return {
        ok: false,
        message: '비정상적인 메시지입니다.',
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

    const findCommand2 = await ctx.prisma.chatbotFunctionCommand.findFirst({
      where: {
        userId: data.userId,
        command: commandName,
      },
    });
    if (findCommand2) {
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
    let commandName = splittedContent[0];
    if (commandName.startsWith('!')) {
      commandName = commandName.slice(1);
    }

    const findCommand2 = await ctx.prisma.chatbotFunctionCommand.findFirst({
      where: {
        userId: data.userId,
        command: commandName,
      },
    });
    if (findCommand2) {
      return {
        ok: true,
        message: 'function 명령어는 삭제할 수 없습니다. 사이트를 통해 삭제해주세요.',
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
    let commandName = splittedContent[0];
    if (commandName.startsWith('!')) {
      commandName = commandName.slice(1);
    }
    const commandResponse = splittedContent[1];

    if (!commandName) {
      return {
        ok: true,
        message: `수정할 명령어와 응답을 입력해주세요. 예) !${query.command} <명령어 이름> <응답>`,
      };
    }

    if (!commandResponse) {
      return {
        ok: true,
        message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} ${commandName} <응답>`,
      };
    }

    if (!commandName || !commandResponse) {
      return {
        ok: false,
        message: '비정상적인 메시지입니다.',
      };
    }

    const findCommand2 = await ctx.prisma.chatbotFunctionCommand.findFirst({
      where: {
        userId: data.userId,
        command: commandName,
      },
    });
    if (findCommand2) {
      return {
        ok: true,
        message: 'function 명령어는 수정할 수 없습니다. 사이트를 통해 수정해주세요.',
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
  updateSpecificCommandEcho: async (ctx, data) => {
    const { content, query } = data;

    const splittedContent = splitContent(content, query.command, 1);
    const response = splittedContent[0];

    if (!response) {
      return {
        ok: true,
        message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} <응답>`,
      };
    }

    const commandId = Number(query.option);

    const findCommand = await ctx.prisma.chatbotEchoCommand.findFirst({
      where: {
        userId: data.userId,
        id: commandId,
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
        response,
      },
    });

    return {
      ok: true,
      message: `${findCommand.command} 명령어가 수정되었습니다.`,
    };
  },
  createChatbotRepeat: async (ctx, data) => {
    const { content, query } = data;

    const splittedContent = splitContent(content, query.command, 1);
    const commandResponse = splittedContent[0];

    if (!commandResponse) {
      return {
        ok: true,
        message: `봇이 응답할 메시지를 함께 입력해주세요. 예) !${query.command} <응답>`,
      };
    }

    const findSetting = await ctx.prisma.userSetting.findFirst({
      where: {
        userId: data.userId,
      },
    });

    if (!findSetting) {
      return {
        ok: true,
        message: '설정이 존재하지 않습니다.',
      };
    }

    const createRepeat = await ctx.prisma.chatbotRepeat.create({
      data: {
        userId: data.userId,
        response: commandResponse,
        interval: findSetting.chatbotDefaultRepeat,
      },
    });

    return {
      ok: true,
      message: `반복 출력 메시지가 생성되었습니다. 반복:${findSetting.chatbotDefaultRepeat}초 id: ${createRepeat.id}`,
    };
  },
  deleteChatbotRepeat: async (ctx, data) => {
    const { content, query } = data;

    const splittedContent = splitContent(content, query.command, 1);
    const repeatId = splittedContent[0];

    if (!repeatId) {
      return {
        ok: true,
        message: `삭제할 반복 메시지의 id를 입력하거나, all 옵션을 입력해주세요. 예) !${query.command} <id> or all`,
      };
    }

    if (repeatId === 'all') {
      await ctx.prisma.chatbotRepeat.deleteMany({
        where: {
          userId: data.userId,
        },
      });

      return {
        ok: true,
        message: `유저의 모든 반복 메시지가 삭제되었습니다.`,
      };
    }

    const repeatIdNum = Number(repeatId);

    const findRepeat = await ctx.prisma.chatbotRepeat.findFirst({
      where: {
        userId: data.userId,
        id: repeatIdNum,
      },
    });

    if (!findRepeat) {
      return {
        ok: true,
        message: '존재하지 않는 반복 메시지입니다.',
      };
    }

    await ctx.prisma.chatbotRepeat.delete({
      where: {
        id: findRepeat.id,
      },
    });

    return {
      ok: true,
      message: `${findRepeat.response} 반복 메시지가 삭제되었습니다.`,
    };
  },
} as FunctionCommand;
