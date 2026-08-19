'use client';

import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

import { DataTable } from './data-table';

/** 반복 메시지 목록 — 클라이언트 조회 (#22) */
export function RepeatsView() {
  const trpc = useTRPC();
  const repeats = useQuery(trpc.command.getRepeatList.queryOptions());
  const setting = useQuery(trpc.user.getUserSetting.queryOptions());

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

  return <DataTable data={repeats.data} interval={setting.data.chatbotDefaultRepeat} />;
}
