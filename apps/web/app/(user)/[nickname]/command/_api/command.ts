'use server';

import {
  chatbotFunctionDefinitionMap,
  getUsageString,
  isChatbotFunctionKey,
  UsageToken,
} from '@wizbot/shared/src/chatbot/definitions';

import { trpc } from '@/src/utils/trpc';

import { Command } from '../_components/columns';

function toUsage(functionKey: string, command: string): { tokens: UsageToken[]; text: string } {
  if (!isChatbotFunctionKey(functionKey)) {
    return { tokens: [{ text: '사용법을 찾을 수 없습니다.' }], text: '사용법을 찾을 수 없습니다.' };
  }
  return {
    tokens: chatbotFunctionDefinitionMap[functionKey].usageTokens(command),
    text: getUsageString(functionKey, command),
  };
}

export async function fetchCommandList(channelName: string): Promise<Command[]> {
  const { function: functionFind, echo: echoFind } =
    await trpc.command.getCommandListByChannelName.query({ channelName });

  const functionList: Command[] = functionFind.map((item) => {
    const usage = toUsage(item.function, item.command);
    return {
      id: item.id,
      command: item.command,
      type: 'function',
      usageTokens: usage.tokens,
      usageString: usage.text,
      description: isChatbotFunctionKey(item.function)
        ? chatbotFunctionDefinitionMap[item.function].descriptionShort
        : '설명을 찾을 수 없습니다.',
      permission: item.permission,
    };
  });

  const echoList: Command[] = echoFind.map((item) => ({
    id: item.id,
    command: item.command,
    type: 'echo',
    usageTokens: [{ text: `!${item.command}` }],
    usageString: `!${item.command}`,
    description: `응답: ${item.response}`,
    permission: 'VIEWER',
  }));

  return [...functionList, ...echoList];
}
