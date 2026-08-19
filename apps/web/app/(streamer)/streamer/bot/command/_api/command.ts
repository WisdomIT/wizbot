'use server';

import {
  chatbotFunctionDefinitionMap,
  getEchoCommandDisplay,
  getFunctionCommandDisplay,
  isChatbotFunctionKey,
} from '@wizbot/shared/src/chatbot/definitions';

import { trpc } from '@/src/utils/trpc';

import { getCurrentUser } from '../../../../../login/_apis/user';
import { Command } from '../_components/columns';
async function assertStreamer() {
  const currentUser = await getCurrentUser();
  if (currentUser.role !== 'streamer') {
    throw new Error('Unauthorized');
  }
  return currentUser;
}

export async function fetchCommandList(): Promise<Command[]> {
  await assertStreamer();

  const { function: functionFind, echo: echoFind } = await trpc.command.getCommandList.query();

  const functionList: Command[] = functionFind.map((item) => {
    const display = getFunctionCommandDisplay(item.function, item.command);
    return {
      id: item.id,
      command: item.command,
      type: 'function',
      usageTokens: display.usageTokens,
      usageString: display.usageString,
      description: display.descriptionShort,
      permission: item.permission,
    };
  });

  const echoList: Command[] = echoFind.map((item) => {
    const display = getEchoCommandDisplay(item.command, item.response);
    return {
      id: item.id,
      command: item.command,
      type: 'echo',
      usageTokens: display.usageTokens,
      usageString: display.usageString,
      description: display.descriptionShort,
      permission: 'VIEWER',
    };
  });

  return [...functionList, ...echoList];
}

export async function fetchCommandById(id: number, type: 'echo' | 'function') {
  await assertStreamer();

  const findCommand = await trpc.command.getCommandById.query({ id, type });

  if (findCommand.type === 'echo') {
    return {
      id: findCommand.id,
      command: findCommand.command,
      type: 'echo',
      response: findCommand.response,
    } as CreateCommandEcho & { id: number };
  }

  return {
    id: findCommand.id,
    command: findCommand.command,
    type: 'function',
    function: findCommand.function,
    permission: findCommand.permission,
    option: findCommand.option ?? undefined,
  } as CreateCommandFunction & { id: number };
}

export type FunctionOptionInput =
  | { type: 'text' }
  | { type: 'select'; options: { label: string; value: string }[] };

/** 함수의 옵션 입력 UI 스펙 조회 — echoCommandSelect 는 스트리머의 echo 명령어 목록으로 채운다 */
export async function getFunctionOption(
  selectedCommandKey: string,
): Promise<FunctionOptionInput | null> {
  await assertStreamer();

  if (!isChatbotFunctionKey(selectedCommandKey)) {
    throw new Error('Command not found');
  }

  const option = chatbotFunctionDefinitionMap[selectedCommandKey].option;
  if (!option) return null;

  if (option.input === 'text') {
    return { type: 'text' };
  }

  // echoCommandSelect — 저장 값은 echo 명령어 id (definitions.ts 참고)
  const { echo } = await trpc.command.getCommandList.query();
  return {
    type: 'select',
    options: echo.map((command) => ({ label: command.command, value: command.id.toString() })),
  };
}

/** 옵션 값 검증 — select 류는 유효한 항목인지 확인하고 저장 값(value)을 반환 */
async function resolveOption(functionKey: string, option?: string): Promise<string | undefined> {
  if (!isChatbotFunctionKey(functionKey)) {
    throw new Error('Command not found');
  }
  const spec = chatbotFunctionDefinitionMap[functionKey].option;
  if (!spec) return undefined;

  if (spec.input === 'text') {
    return option ?? '';
  }

  const optionInput = await getFunctionOption(functionKey);
  if (optionInput?.type === 'select') {
    const selected = optionInput.options.find((item) => item.value === option);
    if (!selected) {
      throw new Error(`${spec.label}을(를) 선택해주세요.`);
    }
    return selected.value;
  }
  return option;
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
  await assertStreamer();

  if (data.type === 'echo') {
    await trpc.command.createCommandEcho.mutate({
      command: data.command,
      response: data.response,
    });
  } else {
    const option = await resolveOption(data.function, data.option);
    await trpc.command.createCommandFunction.mutate({
      command: data.command,
      permission: data.permission,
      function: data.function,
      option,
    });
  }
}

export async function deleteCommand(id: number, type: 'echo' | 'function') {
  await assertStreamer();
  await trpc.command.deleteCommand.mutate({ id, type });
}

export async function updateCommand(data: CreateCommand & { id: number }) {
  await assertStreamer();

  if (data.type === 'echo') {
    await trpc.command.updateCommand.mutate({
      type: 'echo',
      id: data.id,
      command: data.command,
      response: data.response,
    });
  } else {
    const option = await resolveOption(data.function, data.option);
    await trpc.command.updateCommand.mutate({
      type: 'function',
      id: data.id,
      command: data.command,
      permission: data.permission,
      function: data.function,
      option,
    });
  }
}
