'use client';

import { useQuery } from '@tanstack/react-query';
import { Music } from 'lucide-react';
import { useEffect, useState } from 'react';

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

/** 시청자용 플레이리스트 (#5 4단계) — 로그인 없이 보는 페이지라 10초마다 새로 읽는다 */
const REFRESH_MS = 10_000;

function formatDuration(seconds: number) {
  if (!seconds) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PlaylistView({ channelId }: { channelId: string }) {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery({
    ...trpc.song.publicPlaylist.queryOptions({ channelId }),
    refetchInterval: REFRESH_MS,
  });

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <div className="p-8 text-sm text-muted-foreground">불러오지 못했습니다.</div>;
  }

  const playing = data.playback?.status === 'PLAYING';

  return (
    <div className="flex max-w-3xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="size-5" /> 현재 재생
            {!data.songActive && <Badge variant="outline">신청 받지 않음</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.playback ? (
            <div className="flex flex-col gap-2">
              <span className="text-lg font-medium">{data.playback.title}</span>
              <span className="text-sm text-muted-foreground">
                {data.playback.videoUploader}
                {data.playback.requester ? ` · 신청: ${data.playback.requester}` : ''}
              </span>
              {data.playback.durationSeconds > 0 && (
                <Progress
                  positionSeconds={data.playback.positionSeconds}
                  durationSeconds={data.playback.durationSeconds}
                  playing={playing}
                />
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">재생 중인 곡이 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>대기열 {data.queue.length > 0 && `(${data.queue.length})`}</CardTitle>
          {data.maxQueueLength > 0 && (
            <CardDescription>
              최대 {data.maxQueueLength}곡
              {data.maxDurationSeconds > 0 &&
                ` · ${formatDuration(data.maxDurationSeconds)} 이하의 영상만 신청 가능`}
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
                        <span className="text-xs text-muted-foreground">{song.videoUploader}</span>
                      </div>
                    </TableCell>
                    <TableCell className="break-words whitespace-normal">
                      {song.requester}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatDuration(song.durationSeconds)}
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
  );
}

/** 서버는 5초마다 위치를 받으므로 그 사이는 클라이언트에서 보간한다 */
function Progress({
  positionSeconds,
  durationSeconds,
  playing,
}: {
  positionSeconds: number;
  durationSeconds: number;
  playing: boolean;
}) {
  const [position, setPosition] = useState(positionSeconds);

  useEffect(() => setPosition(positionSeconds), [positionSeconds]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () => setPosition((prev) => Math.min(durationSeconds, prev + 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [playing, durationSeconds]);

  const ratio = durationSeconds > 0 ? Math.min(1, position / durationSeconds) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
        {formatDuration(position)}
      </span>
      <div className="h-2 flex-1 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-[width]"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="w-12 text-xs tabular-nums text-muted-foreground">
        {formatDuration(durationSeconds)}
      </span>
    </div>
  );
}
