/* eslint-disable no-console */
import { ChatbotEchoCommand, ChatbotFunctionCommand, ChatbotPermission } from '@prisma/client';

import { getAccessToken } from '../lib/accessToken';
import { Context } from '../trpc';
import { functionChzzk } from './chzzk';
import { functionCommand } from './command';
import { functionSong } from './song';

export interface ChatbotData {
  userId: number;
  senderNickname: string;
  senderRole: ChatbotPermission;
  content: string;
}

export interface ChatbotDataFunction extends ChatbotData {
  query: ChatbotFunctionCommand;
  accessToken: string;
}

export interface ChabotReturn {
  ok: boolean;
  message: string;
}

export interface FunctionCommand {
  [key: string]: (ctx: Context, data: ChatbotDataFunction) => Promise<ChabotReturn>;
}

export const functions = {
  ...functionCommand,
  ...functionSong,
  ...functionChzzk,
};

export default async function chatbot(ctx: Context, data: ChatbotData): Promise<ChabotReturn> {
  const { userId, senderNickname, senderRole, content } = data;

  const contentWithoutPrefix = content.slice(1).trim();
  const command1 = contentWithoutPrefix.split(' ')[0];
  const commandOthers = contentWithoutPrefix.split(' ').slice(1).join(' ');

  const echoFind = await ctx.prisma.chatbotEchoCommand.findMany({
    where: {
      userId,
      command: {
        startsWith: command1,
      },
    },
  });

  if (echoFind.length > 0) {
    const matched = echoFind
      .filter((cmd) => {
        const prefix = cmd.command;
        return (
          contentWithoutPrefix === prefix || // 완전히 같거나
          contentWithoutPrefix.startsWith(prefix + ' ') // 정확한 접두사 + 공백
        );
      })
      .sort((a, b) => b.command.length - a.command.length)[0];

    if (matched) {
      return {
        ok: true,
        message: matched.response,
      };
    }
  }

  const functionFind = await ctx.prisma.chatbotFunctionCommand.findMany({
    where: {
      userId,
      command: {
        startsWith: command1,
      },
    },
  });

  if (!functionFind) {
    return {
      ok: false,
      message: 'Command not found',
    };
  }

  const matched = functionFind
    .filter((cmd) => {
      const prefix = cmd.command;
      return (
        contentWithoutPrefix === prefix || // 완전히 같거나
        contentWithoutPrefix.startsWith(prefix + ' ') // 정확한 접두사 + 공백
      );
    })
    .sort((a, b) => b.command.length - a.command.length)[0];

  if (!matched) {
    return {
      ok: false,
      message: 'Command not found',
    };
  }

  const ROLE_PRIORITY = {
    VIEWER: 1,
    MANAGER: 2,
    STREAMER: 3,
  } as const;

  type Role = keyof typeof ROLE_PRIORITY;

  // 권한 비교 함수
  function hasPermission(senderRole: Role, requiredPermission: Role): boolean {
    return ROLE_PRIORITY[senderRole] >= ROLE_PRIORITY[requiredPermission];
  }

  if (!hasPermission(senderRole, matched.permission)) {
    return {
      ok: true,
      message: '권한이 없습니다',
    };
  }

  const thisFunction = functions[matched.function];

  if (!thisFunction) {
    return {
      ok: false,
      message: 'Function not found',
    };
  }

  const accessToken = await getAccessToken(ctx, userId);

  if (!accessToken) {
    return {
      ok: false,
      message: 'Access token not found',
    };
  }

  try {
    const functionAction = await thisFunction(ctx, {
      ...data,
      query: matched,
      accessToken: accessToken.accessToken,
    });

    if (!functionAction.ok) {
      return {
        ok: false,
        message: functionAction.message,
      };
    }

    return {
      ok: true,
      message: functionAction.message,
    };
  } catch (error) {
    console.error('Error in function:', error);
    return {
      ok: false,
      message: 'Function execution failed',
    };
  }
}

interface ChatbotDatabaseInitial {
  initialFunction: ChatbotFunctionCommand[];
  initialEcho: ChatbotEchoCommand[];
}

export function getChatbotDatabaseInitial(userId: number): ChatbotDatabaseInitial {
  const initialFunction = [
    {
      userId: userId,
      permission: 'MANAGER',
      command: '추가',
      function: 'createCommandEcho',
    },
    {
      userId: userId,
      permission: 'MANAGER',
      command: '삭제',
      function: 'deleteCommandEcho',
    },
    {
      userId: userId,
      permission: 'MANAGER',
      command: '수정',
      function: 'updateCommandEcho',
    },
    {
      userId: userId,
      permission: 'VIEWER',
      command: '방제',
      function: 'getChzzkTitle',
    },
    {
      userId: userId,
      permission: 'VIEWER',
      command: '카테고리',
      function: 'getChzzkCategory',
    },
    {
      userId: userId,
      permission: 'VIEWER',
      command: '업타임',
      function: 'getChzzkUptime',
    },
    {
      userId: userId,
      permission: 'MANAGER',
      command: '방제 수정',
      function: 'updateChzzkTitle',
    },
    {
      userId: userId,
      permission: 'MANAGER',
      command: '카테고리 수정',
      function: 'updateChzzkCategory',
    },
    {
      userId: userId,
      permission: 'MANAGER',
      command: '공지',
      function: 'setChzzkNotice',
    },
  ] as ChatbotFunctionCommand[];
  const initialEcho = [
    {
      userId: userId,
      command: '테스트',
      response: '챗봇 명령어 테스트입니다',
    },
  ] as ChatbotEchoCommand[];

  return {
    initialFunction,
    initialEcho,
  };
}
