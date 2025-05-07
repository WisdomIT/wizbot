'use server';

import { createElement } from 'react';

import chatbotData from '@/src/chatbot';
import { trpc } from '@/src/utils/trpc';

import { getCurrentUser } from '../../../../../login/_apis/user';
import { Command } from '../_components/columns';

export async function fetchCommandList() {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const { function: functionFind, echo: echoFind } = await trpc.command.getCommandList.query({
    userId: currentUser.id,
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

export async function fetchCommandById(id: number, type: 'echo' | 'function') {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const findCommand = await trpc.command.getCommandById.query({
    userId: currentUser.id,
    id,
    type,
  });

  if (!findCommand) {
    throw new Error('Command not found');
  }

  if (type === 'echo' && findCommand.type === 'echo') {
    return {
      id: findCommand.id,
      command: findCommand.command,
      type: 'echo',
      response: findCommand.response,
    } as CreateCommandEcho;
  }

  if (type === 'function' && findCommand.type === 'function') {
    return {
      id: findCommand.id,
      command: findCommand.command,
      type: 'function',
      function: findCommand.function,
      permission: findCommand.permission,
      option: findCommand.option,
    } as CreateCommandFunction;
  }

  throw new Error('Command not found');
}

export async function getFunctionOption(selectedCommandKey: string) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const findCommand = chatbotData[selectedCommandKey as keyof typeof chatbotData];
  if (!findCommand) {
    throw new Error('Command not found');
  }

  const option = findCommand.optionInput;
  if (!option) {
    return null;
  }

  const optionData = await option(currentUser.id);

  if (optionData.type === 'text') {
    return {
      type: 'text' as const,
    };
  }
  if (optionData.type === 'select') {
    return {
      type: 'select' as const,
      options: optionData.options,
    };
  }

  throw new Error('Invalid option type');
}

interface CreateCommandEcho {
  command: string;
  type: 'echo';
  response: string;
}

interface CreateCommandFunction {
  command: string;
  type: 'function';
  function: string;
  permission: 'STREAMER' | 'MANAGER' | 'VIEWER';
  option?: string;
}

export type CreateCommand = CreateCommandEcho | CreateCommandFunction;

export async function createCommand(data: CreateCommand) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  if (data.type === 'echo') {
    await trpc.command.createCommandEcho.mutate({
      userId: currentUser.id,
      command: data.command,
      response: data.response,
    });
  } else {
    //TODO: option이 정상적인 값인지 검증하는 로직 추가
    await trpc.command.createCommandFunction.mutate({
      userId: currentUser.id,
      command: data.command,
      permission: data.permission,
      function: data.function,
      option: data.option,
    });
  }
}

export async function deleteCommand(id: number, type: 'echo' | 'function') {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  await trpc.command.deleteCommand.mutate({
    userId: currentUser.id,
    id,
    type,
  });
}

export async function updateCommand(data: CreateCommand & { id: number }) {
  const currentUser = await getCurrentUser();

  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  if (data.type === 'echo') {
    await trpc.command.updateCommand.mutate({
      type: 'echo',
      userId: currentUser.id,
      id: data.id,
      command: data.command,
      response: data.response,
    });
  } else {
    //TODO: option이 정상적인 값인지 검증하는 로직 추가
    await trpc.command.updateCommand.mutate({
      type: 'function',
      userId: currentUser.id,
      id: data.id,
      command: data.command,
      permission: data.permission,
      function: data.function,
      option: data.option,
    });
  }
}
