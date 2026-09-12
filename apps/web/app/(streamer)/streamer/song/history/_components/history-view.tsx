'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Heart, RotateCcw } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { SearchInput } from '@/components/data-table/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { pickDefaultFavorite } from '@/lib/default-favorite';
import { useSearchState } from '@/src/hooks/use-search-state';
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
  const date = new Date(value);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUSES: Status[] = ['PLAYED', 'SKIPPED', 'CANCELED', 'FAILED'];
/** URL 쿼리 상태 (#265) — 필터만. 「더 보기」로 이어 붙인 위치는 커서라 주소에 남기지 않는다 */
const DEFAULTS = { status: 'ALL', q: '' };

/** 재생 기록 (#5 4단계) — 큐에서 사라진 곡도 전부 남는다 */
export function HistoryView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [state, setState] = useSearchState(DEFAULTS);
  const status: Status | 'ALL' = STATUSES.includes(state.status as Status) ? (state.status as Status) : 'ALL';
  const appliedSearch = state.q.trim();

  const filters = {
    ...(status === 'ALL' ? {} : { status }),
    ...(appliedSearch ? { query: appliedSearch } : {}),
  };

  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery(
      trpc.song.history.infiniteQueryOptions(filters, {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      }),
    );

  const favorites = useQuery(trpc.songFavorite.list.queryOptions());

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries(trpc.song.history.infiniteQueryFilter());
    void queryClient.invalidateQueries(trpc.song.getState.queryFilter());
  }, [queryClient, trpc]);

  const run = useCallback(
    (promise: Promise<unknown>, success: string) => {
      toast.promise(promise, {
        loading: '처리 중...',
        success: () => {
          invalidate();
          return success;
        },
        error: (err) => `${err instanceof Error ? err.message : err}`,
      });
    },
    [invalidate],
  );

  const setHidden = useMutation(trpc.song.setHistoryHidden.mutationOptions());
  const requeue = useMutation(trpc.song.requeueFromHistory.mutationOptions());
  const addToFavorite = useMutation(trpc.songFavorite.addItem.mutationOptions());

  // 미니 플레이어·큰 창 하트와 같은 규칙 (#264)
  const defaultFavorite = pickDefaultFavorite(favorites.data?.favorites ?? []);

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>재생 기록</CardTitle>
          <CardDescription>
            대기열에서 사라진 곡도 모두 남습니다. 같은 사람이 반복해서 신청하는지 확인하거나,
            지난 곡을 다시 올릴 때 씁니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(value) => setState({ status: value })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">전체 상태</SelectItem>
                <SelectItem value="PLAYED">재생됨</SelectItem>
                <SelectItem value="SKIPPED">넘김</SelectItem>
                <SelectItem value="CANCELED">취소됨</SelectItem>
                <SelectItem value="FAILED">재생 실패</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex flex-1 items-center gap-2">
              <SearchInput
                value={state.q}
                onChange={(q) => setState({ q })}
                placeholder="제목 또는 신청자 검색"
              />
              {(appliedSearch || status !== 'ALL') && (
                <Button type="button" variant="ghost" onClick={() => setState({ q: '', status: 'ALL' })}>
                  초기화
                </Button>
              )}
            </div>
          </div>

          {isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : error ? (
            <p className="py-8 text-sm text-muted-foreground">
              불러오지 못했습니다: {error.message}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">시각</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="w-28">신청자</TableHead>
                    <TableHead className="w-24">상태</TableHead>
                    <TableHead className="w-32 text-right">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                        기록이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((entry) => (
                      <TableRow key={entry.id} className={entry.hiddenFromViewers ? 'opacity-60' : ''}>
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
                            <span className="text-xs text-muted-foreground">
                              {entry.videoUploader}
                            </span>
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
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="대기열에 다시 올리기"
                            title="대기열에 다시 올리기"
                            onClick={() =>
                              run(
                                requeue.mutateAsync({ id: entry.id }),
                                `${entry.title} 을(를) 대기열에 올렸습니다.`,
                              )
                            }
                          >
                            <RotateCcw />
                          </Button>
                          {defaultFavorite && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="즐겨찾기에 담기"
                              title={`즐겨찾기에 담기 (${defaultFavorite.name})`}
                              onClick={() =>
                                run(
                                  addToFavorite.mutateAsync({
                                    id: defaultFavorite.id,
                                    query: entry.youtubeId,
                                  }),
                                  `"${defaultFavorite.name}"에 담았습니다.`,
                                )
                              }
                            >
                              <Heart />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={entry.hiddenFromViewers ? '시청자에게 공개' : '시청자에게 숨기기'}
                            title={entry.hiddenFromViewers ? '시청자에게 공개' : '시청자에게 숨기기'}
                            onClick={() =>
                              run(
                                setHidden.mutateAsync({
                                  id: entry.id,
                                  hidden: !entry.hiddenFromViewers,
                                }),
                                entry.hiddenFromViewers
                                  ? '시청자에게 공개합니다.'
                                  : '시청자에게 숨겼습니다.',
                              )
                            }
                          >
                            {entry.hiddenFromViewers ? <EyeOff /> : <Eye />}
                          </Button>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
