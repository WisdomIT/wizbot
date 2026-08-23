'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getEchoCommandDisplay,
  getFunctionCommandDisplay,
} from '@wizbot/shared/src/chatbot/definitions';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

import { Command } from './columns';
import { DataTable } from './data-table';

/** 명령어 목록 — 클라이언트에서 조회하고 표시값은 shared 정의로 파생한다 (#22) */
export function CommandsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.command.getCommandList.queryOptions());
  const setEnabled = useMutation(trpc.command.setEnabled.mutationOptions());

  const handleToggle = useCallback(
    (command: Command, enabled: boolean) => {
      toast.promise(setEnabled.mutateAsync({ id: command.id, type: command.type, enabled }), {
        loading: '변경 중...',
        success: () => {
          void queryClient.invalidateQueries(trpc.command.getCommandList.queryFilter());
          return `!${command.command} 명령어를 ${enabled ? '켰습니다' : '껐습니다'}.`;
        },
        error: (err) => `변경에 실패했습니다. ${err instanceof Error ? err.message : err}`,
      });
    },
    [setEnabled, queryClient, trpc],
  );

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
        enabled: item.enabled,
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
        enabled: item.enabled,
        command: item.command,
        type: 'echo' as const,
        usageTokens: display.usageTokens,
        usageString: display.usageString,
        description: display.descriptionShort,
        permission: 'VIEWER' as const,
      };
    }),
  ];

  return <DataTable data={commands} onToggle={handleToggle} />;
}
