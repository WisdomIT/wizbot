import { ChatbotFunctionCommand, ChatbotPermission } from '@prisma/client';

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

  const contentWithoutPrefix = content.slice(1);
  const command1 = contentWithoutPrefix.split(' ')[0];
  const commandOthers = contentWithoutPrefix.split(' ').slice(1).join(' ');

  const echoFind = await ctx.prisma.chatbotEchoCommand.findFirst({
    where: {
      userId,
      command: command1,
    },
  });

  if (echoFind) {
    return {
      ok: true,
      message: echoFind.response,
    };
  }

  const commandFind = await ctx.prisma.chatbotFunctionCommand.findFirst({
    where: {
      userId,
      command: command1,
    },
  });

  if (!commandFind) {
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

  if (!hasPermission(senderRole, commandFind.permission)) {
    return {
      ok: true,
      message: '권한이 없습니다',
    };
  }

  const thisFunction = functions[commandFind.function];

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

  const functionAction = await thisFunction(ctx, {
    ...data,
    query: commandFind,
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
}
