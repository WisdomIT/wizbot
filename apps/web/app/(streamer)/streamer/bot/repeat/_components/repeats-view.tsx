'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

import { Repeat } from './columns';
import { DataTable } from './data-table';

/** 반복 메시지 목록 — 클라이언트 조회 (#22), 활성 토글 (#82) */
export function RepeatsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const repeats = useQuery(trpc.command.getRepeatList.queryOptions());
  const setting = useQuery(trpc.user.getUserSetting.queryOptions());
  const setEnabled = useMutation(trpc.command.setRepeatEnabled.mutationOptions());

  const handleToggle = useCallback(
    (repeat: Repeat, enabled: boolean) => {
      toast.promise(setEnabled.mutateAsync({ id: repeat.id, enabled }), {
        loading: '변경 중...',
        success: () => {
          void queryClient.invalidateQueries(trpc.command.getRepeatList.queryFilter());
          return enabled
            ? '반복 메시지를 켰습니다. 1분 내에 전송이 시작됩니다.'
            : '반복 메시지를 껐습니다. 1분 내에 전송이 멈춥니다.';
        },
        error: (err) => `변경에 실패했습니다. ${err instanceof Error ? err.message : err}`,
      });
    },
    [setEnabled, queryClient, trpc],
  );

  if (repeats.isPending || setting.isPending) {
    return (
      <div className="flex flex-col gap-2 py-4">
        <Skeleton className="h-9 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (repeats.error || setting.error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        목록을 불러오지 못했습니다: {(repeats.error ?? setting.error)?.message}
      </div>
    );
  }

  return (
    <DataTable
      data={repeats.data}
      interval={setting.data.chatbotDefaultRepeat}
      onToggle={handleToggle}
    />
  );
}
