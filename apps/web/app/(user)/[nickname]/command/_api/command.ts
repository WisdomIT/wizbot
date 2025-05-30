'use server';

import { createElement } from 'react';

import chatbotData from '@/src/chatbot';
import { trpc } from '@/src/utils/trpc';

import { Command } from '../_components/columns';

export async function fetchCommandList(channelName: string) {
  const streamer = await trpc.user.getUserByChannelName.query({ channelName });
  if (!streamer) {
    throw new Error('잘못된 요청입니다.');
  }

  const { function: functionFind, echo: echoFind } = await trpc.command.getCommandList.query({
    userId: streamer.id,
  });

  const functionList = functionFind.map((item) => {
    const findCommand = chatbotData[item.function as keyof typeof chatbotData];
    if (!findCommand) {
      return {
        id: item.id,
        command: item.command,
        type: 'function',
        usage: createElement('span', { className: 'text-sm' }, '사용법을 찾을 수 없습니다.'),
        usageString: '사용법을 찾을 수 없습니다.',
        description: '설명을 찾을 수 없습니다.',
        permission: item.permission,
      };
    }

    return {
      id: item.id,
      command: item.command,
      type: 'function',
      usage: findCommand.usage(item.command, item.option ?? undefined),
      usageString: findCommand.usageString(item.command, item.option ?? undefined),
      description: findCommand.descriptionShort,
      permission: item.permission,
    };
  }) as Command[];

  const echoList = echoFind.map((item) => ({
    id: item.id,
    command: item.command,
    type: 'echo',
    usage: createElement('span', { className: 'text-sm' }, `!${item.command}`),
    usageString: `!${item.command}`,
    description: `응답: ${item.response}`,
    permission: 'VIEWER',
  })) as Command[];

  return [...functionList, ...echoList];
}
