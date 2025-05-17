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

function findExactCommandMatch<T extends { command: string }>(
  content: string,
  commands: T[],
): { matched: T; args: string } | null {
  const contentTrimmed = content.trim();
  const sorted = [...commands].sort((a, b) => b.command.length - a.command.length);

  for (const cmd of sorted) {
    const prefix = cmd.command.trim();
    if (
      contentTrimmed === prefix || // 완전 일치
      contentTrimmed.startsWith(prefix + ' ') // 명령어 + 공백으로 구분된 인수
    ) {
      const args = contentTrimmed.slice(prefix.length).trim();
      return { matched: cmd, args };
    }
  }

  return null;
}

export default async function chatbot(ctx: Context, data: ChatbotData): Promise<ChabotReturn> {
  const { userId, senderNickname, senderRole, content } = data;

  const contentWithoutPrefix = content.slice(1).trim();

  const echoCommands = await ctx.prisma.chatbotEchoCommand.findMany({ where: { userId } });
  const matchedEcho = findExactCommandMatch(contentWithoutPrefix, echoCommands);

  const functionCommands = await ctx.prisma.chatbotFunctionCommand.findMany({ where: { userId } });
  const matchedFunction = findExactCommandMatch(contentWithoutPrefix, functionCommands);

  if (!matchedEcho && !matchedFunction) {
    return { ok: false, message: 'Command not found' };
  }

  const echoLen = matchedEcho?.matched.command.length ?? 0;
  const funcLen = matchedFunction?.matched.command.length ?? 0;

  if (!matchedFunction || echoLen > funcLen) {
    return {
      ok: true,
      message: matchedEcho!.matched.response,
    };
  }

  if (!matchedFunction) {
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

  if (!hasPermission(senderRole, matchedFunction.matched.permission)) {
    return {
      ok: true,
      message: '권한이 없습니다',
    };
  }

  const thisFunction = functions[matchedFunction.matched.function];

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
      query: matchedFunction.matched,
      accessToken: accessToken,
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

export function getChatbotDatabaseInitial(
  userId: number,
  channelName: string,
): ChatbotDatabaseInitial {
  const initialFunction = [
    {
      userId,
      permission: 'MANAGER',
      command: '추가',
      function: 'createCommandEcho',
    },
    {
      userId,
      permission: 'MANAGER',
      command: '삭제',
      function: 'deleteCommandEcho',
    },
    {
      userId,
      permission: 'MANAGER',
      command: '수정',
      function: 'updateCommandEcho',
    },
    {
      userId,
      permission: 'VIEWER',
      command: '방제',
      function: 'getChzzkTitle',
    },
    {
      userId,
      permission: 'VIEWER',
      command: '카테고리',
      function: 'getChzzkCategory',
    },
    {
      userId,
      permission: 'VIEWER',
      command: '업타임',
      function: 'getChzzkUptime',
    },
    {
      userId,
      permission: 'MANAGER',
      command: '방제 수정',
      function: 'updateChzzkTitle',
    },
    {
      userId,
      permission: 'MANAGER',
      command: '카테고리 수정',
      function: 'updateChzzkCategory',
    },
    {
      userId,
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
    {
      userId,
      command: '봇',
      response: `${process.env.PUBLIC_SITE_URL}/${channelName}`,
    },
    {
      userId,
      command: '명령어',
      response: `${process.env.PUBLIC_SITE_URL}/${channelName}/command`,
    },
  ] as ChatbotEchoCommand[];

  return {
    initialFunction,
    initialEcho,
  };
}
