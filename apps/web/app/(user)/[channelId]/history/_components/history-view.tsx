'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

type Status = 'PLAYED' | 'SKIPPED' | 'CANCELED' | 'FAILED';

const STATUS_LABEL: Record<Status, string> = {
  PLAYED: '재생됨',
  SKIPPED: '넘김',
  CANCELED: '취소됨',
  FAILED: '재생 실패',
};

const STATUS_VARIANT: Record<Status, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  PLAYED: 'default',
  SKIPPED: 'secondary',
  CANCELED: 'outline',
  FAILED: 'destructive',
};

function formatWhen(value: string | Date) {
  return new Date(value).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** 시청자용 재생 기록 (#5 4단계) — 스트리머가 공개했을 때만 보인다 */
export function HistoryView({ channelId }: { channelId: string }) {
  const trpc = useTRPC();
  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      trpc.song.publicHistory.infiniteQueryOptions(
        { channelId },
        { getNextPageParam: (page) => page.nextCursor ?? undefined },
      ),
    );

  if (isPending) {
    return (
      <div className="p-4">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {error.message}
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = data.pages.flatMap((page) => page.items);

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>재생 기록</CardTitle>
          <CardDescription>지금까지 신청된 곡입니다. 최신순으로 보여줍니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">시각</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-28">신청자</TableHead>
                <TableHead className="w-24">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    아직 기록이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatWhen(entry.requestedAt)}
                    </TableCell>
                    <TableCell className="break-words whitespace-normal">
                      <div className="flex flex-col">
                        {/* 제목을 누르면 유튜브에서 새 창으로 열린다 */}
                        <a
                          href={`https://www.youtube.com/watch?v=${entry.youtubeId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {entry.title}
                        </a>
                        <span className="text-xs text-muted-foreground">{entry.videoUploader}</span>
                      </div>
                    </TableCell>
                    <TableCell className="break-words whitespace-normal">
                      {entry.requester}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[entry.status as Status]}>
                        {STATUS_LABEL[entry.status as Status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? '불러오는 중...' : '더 보기'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
