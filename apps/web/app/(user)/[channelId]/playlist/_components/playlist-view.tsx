'use client';

import { useQuery } from '@tanstack/react-query';

import { formatTime, SongPlayer, usePlayerPosition } from '@/components/song/song-player';
import { Badge } from '@/components/ui/badge';
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

/** 시청자용 플레이리스트 (#5 #97) — 콘솔과 같은 플레이어 UI 에서 편집만 뺀 화면 */
const REFRESH_MS = 10_000;

export function PlaylistView({ channelId }: { channelId: string }) {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery({
    ...trpc.song.publicPlaylist.queryOptions({ channelId }),
    refetchInterval: REFRESH_MS,
  });

  const position = usePlayerPosition(
    data?.playback?.positionSeconds ?? 0,
    data?.playback?.durationSeconds ?? 0,
    data?.playback?.status === 'PLAYING',
  );

  if (isPending) {
    return (
      <div className="grid gap-4 py-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Skeleton className="h-[24rem] w-full" />
        <Skeleton className="h-[24rem] w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="py-8 text-sm text-muted-foreground">불러오지 못했습니다.</div>;
  }

  const playback = data.playback ?? {
    status: 'STOPPED' as const,
    youtubeId: null,
    title: null,
    videoUploader: null,
    requester: null,
    durationSeconds: 0,
    positionSeconds: 0,
  };

  return (
    <div className="flex flex-col gap-4 py-4">
      {!data.songActive && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">신청 받지 않음</Badge>
          지금은 노래 신청을 받지 않습니다.
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <SongPlayer playback={playback} position={position} />

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>대기열 {data.queue.length > 0 && `(${data.queue.length})`}</CardTitle>
              {data.maxQueueLength > 0 && (
                <CardDescription>
                  최대 {data.maxQueueLength}곡
                  {data.maxDurationSeconds > 0 &&
                    ` · ${formatTime(data.maxDurationSeconds)} 이하의 영상만 신청 가능`}
                  {data.oneRequestPerUser && ' · 1인 1곡'}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="w-28">신청자</TableHead>
                    <TableHead className="w-16 text-right">길이</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.queue.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                        대기열이 비어 있습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.queue.map((song, index) => (
                      <TableRow key={song.id}>
                        <TableCell className="tabular-nums">{index + 1}</TableCell>
                        <TableCell className="break-words whitespace-normal">
                          <div className="flex flex-col">
                            <span>{song.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {song.videoUploader}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="break-words whitespace-normal">
                          {song.requester}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatTime(song.durationSeconds)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {data.commands.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>신청 방법</CardTitle>
                <CardDescription>방송 채팅에 아래 명령어를 입력하세요.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {data.commands.map((command) => (
                  <div key={command.command} className="flex flex-col gap-1">
                    <code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm">
                      {command.usageString}
                    </code>
                    <span className="text-sm text-muted-foreground">{command.description}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
