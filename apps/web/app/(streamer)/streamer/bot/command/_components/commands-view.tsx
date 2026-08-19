'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getEchoCommandDisplay,
  getFunctionCommandDisplay,
} from '@wizbot/shared/src/chatbot/definitions';

import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

import { Command } from './columns';
import { DataTable } from './data-table';

/** 명령어 목록 — 클라이언트에서 조회하고 표시값은 shared 정의로 파생한다 (#22) */
export function CommandsView() {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery(trpc.command.getCommandList.queryOptions());

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 py-4">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        목록을 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  const commands: Command[] = [
    ...data.function.map((item) => {
      const display = getFunctionCommandDisplay(item.function, item.command);
      return {
        id: item.id,
        command: item.command,
        type: 'function' as const,
        usageTokens: display.usageTokens,
        usageString: display.usageString,
        description: display.descriptionShort,
        permission: item.permission,
      };
    }),
    ...data.echo.map((item) => {
      const display = getEchoCommandDisplay(item.command, item.response);
      return {
        id: item.id,
        command: item.command,
        type: 'echo' as const,
        usageTokens: display.usageTokens,
        usageString: display.usageString,
        description: display.descriptionShort,
        permission: 'VIEWER' as const,
      };
    }),
  ];

  return <DataTable data={commands} />;
}
