'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, RefreshCw, SkipForward, Square } from 'lucide-react';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSongEvents } from '@/src/hooks/use-song-events';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 뮤직플레이어 = 컨트롤러 (#5 2단계).
 * 이 페이지는 소리를 내지 않는다 — 실제 재생은 OBS 브라우저 소스(또는 앱)가 담당한다.
 */
export function PlayerView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.song.getState.queryOptions());

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries(trpc.song.getState.queryFilter()),
    [queryClient, trpc],
  );

  // 서버 이벤트로 즉시 갱신 (폴링 없이)
  useSongEvents((event) => {
    if (event.type === 'playback' || event.type === 'queue' || event.type === 'source') {
      invalidate();
    }
  });

  const play = useMutation(trpc.song.play.mutationOptions());
  const pause = useMutation(trpc.song.pause.mutationOptions());
  const stop = useMutation(trpc.song.stop.mutationOptions());
  const next = useMutation(trpc.song.next.mutationOptions());
  const setVolume = useMutation(trpc.song.setVolume.mutationOptions());
  const setSourceType = useMutation(trpc.song.setSourceType.mutationOptions());
  const regenerate = useMutation(trpc.song.regenerateToken.mutationOptions());

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">불러오지 못했습니다: {error.message}</div>
    );
  }

  const { playback, queue, source } = data;
  const playing = playback.status === 'PLAYING';

  const run = (promise: Promise<unknown>, success: string) => {
    toast.promise(promise, {
      loading: '처리 중...',
      success: () => {
        invalidate();
        return success;
      },
      error: (err) => `${err instanceof Error ? err.message : err}`,
    });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 py-4">
      <SourceCard
        source={source}
        onChangeType={(sourceType) =>
          run(setSourceType.mutateAsync({ sourceType }), '송출 소스를 변경했습니다.')
        }
        onRegenerate={(kind) =>
          run(
            regenerate.mutateAsync({ kind }),
            '주소를 새로 발급했습니다. OBS 에 다시 붙여넣으세요.',
          )
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>현재 재생</CardTitle>
          <CardDescription>
            이 페이지는 컨트롤러입니다. 소리는 송출 소스에서 재생됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col">
            <span className="font-medium">{playback.title ?? '재생 중인 곡이 없습니다.'}</span>
            {playback.title && (
              <span className="text-sm text-muted-foreground">
                {playback.videoUploader}
                {playback.requester ? ` · 신청: ${playback.requester}` : ''}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {playing ? (
              <Button onClick={() => run(pause.mutateAsync(), '일시정지했습니다.')}>
                <Pause /> 일시정지
              </Button>
            ) : (
              <Button onClick={() => run(play.mutateAsync(), '재생을 시작했습니다.')}>
                <Play /> 재생
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => run(next.mutateAsync(), '다음 곡으로 넘겼습니다.')}
            >
              <SkipForward /> 다음 곡
            </Button>
            <Button variant="outline" onClick={() => run(stop.mutateAsync(), '정지했습니다.')}>
              <Square /> 정지
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">볼륨</span>
              <Input
                type="number"
                min={0}
                max={100}
                defaultValue={playback.volume}
                className="w-20"
                onBlur={(event) => {
                  const volume = Number(event.target.value);
                  if (Number.isFinite(volume) && volume !== playback.volume) {
                    run(setVolume.mutateAsync({ volume }), `볼륨을 ${volume} 로 변경했습니다.`);
                  }
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>대기열 {queue.length > 0 && `(${queue.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-32">신청자</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-20 text-center text-muted-foreground">
                    대기열이 비어 있습니다.
                  </TableCell>
                </TableRow>
              ) : (
                queue.map((song, index) => (
                  <TableRow key={song.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{song.title}</span>
                        <span className="text-xs text-muted-foreground">{song.videoUploader}</span>
                      </div>
                    </TableCell>
                    <TableCell>{song.requester}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SourceCard({
  source,
  onChangeType,
  onRegenerate,
}: {
  source: {
    sourceType: 'NONE' | 'OBS' | 'ELECTRON';
    online: boolean;
    sourceToken: string | null;
    overlayToken: string | null;
  };
  onChangeType: (sourceType: 'NONE' | 'OBS' | 'ELECTRON') => void;
  onRegenerate: (kind: 'source' | 'overlay') => void;
}) {
  const [origin, setOrigin] = useState('');
  useState(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  });

  const playerUrl = source.sourceToken ? `${origin}/obs/${source.sourceToken}/player` : '';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          송출 소스
          {source.sourceType === 'NONE' ? (
            <Badge variant="outline">사용 안 함</Badge>
          ) : source.online ? (
            <Badge>연결됨</Badge>
          ) : (
            <Badge variant="destructive">연결 안 됨</Badge>
          )}
        </CardTitle>
        <CardDescription>
          소리를 내보낼 경로입니다. OBS 를 선택했다면 아래 주소를 브라우저 소스로 추가하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Select value={source.sourceType} onValueChange={(value) => onChangeType(value as never)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OBS">OBS 브라우저 소스</SelectItem>
              <SelectItem value="ELECTRON">위즈봇 플레이어 앱</SelectItem>
              <SelectItem value="NONE">사용 안 함</SelectItem>
            </SelectContent>
          </Select>
          {source.sourceType !== 'NONE' && !source.online && (
            <span className="text-sm text-destructive">
              송출 소스가 연결되어 있지 않습니다. 재생해도 소리가 나지 않습니다.
            </span>
          )}
        </div>

        {source.sourceType === 'OBS' && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">브라우저 소스 주소</span>
            <div className="flex items-center gap-2">
              <Input readOnly value={playerUrl} className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(playerUrl);
                  toast.success('주소를 복사했습니다.');
                }}
              >
                복사
              </Button>
              <Button variant="outline" onClick={() => onRegenerate('source')} title="주소 재발급">
                <RefreshCw />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ 이 주소를 아는 사람은 재생 상태를 볼 수 있습니다. 방송 화면에 노출됐다면
              재발급하세요.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
