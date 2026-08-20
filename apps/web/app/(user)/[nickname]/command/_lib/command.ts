import 'server-only';

import {
  getEchoCommandDisplay,
  getFunctionCommandDisplay,
} from '@wizbot/shared/src/chatbot/definitions';
import { unstable_cache } from 'next/cache';

import { trpc } from '@/src/utils/trpc';

import { Command } from '../_components/columns';

/** 시청자 공개 명령어 목록 — 60초 캐시 (#23) */
export const fetchCommandList = unstable_cache(
  async (channelName: string): Promise<Command[]> => {
    const { function: functionFind, echo: echoFind } =
      await trpc.command.getCommandListByChannelName.query({ channelName });

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
  },
  ['public-command-list'],
  { revalidate: 60 },
);
