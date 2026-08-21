'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  PlayCircle,
  RefreshCw,
  SkipForward,
  Square,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
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
  const addToQueue = useMutation(trpc.song.addToQueue.mutationOptions());
  const moveInQueue = useMutation(trpc.song.moveInQueue.mutationOptions());
  const removeFromQueue = useMutation(trpc.song.removeFromQueue.mutationOptions());
  const playNow = useMutation(trpc.song.playNow.mutationOptions());
  const seek = useMutation(trpc.song.seek.mutationOptions());

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

          {playback.title && playback.durationSeconds > 0 && (
            <ProgressBar
              positionSeconds={playback.positionSeconds}
              durationSeconds={playback.durationSeconds}
              playing={playing}
              onSeek={(seconds) =>
                run(seek.mutateAsync({ positionSeconds: seconds }), '재생 위치를 옮겼습니다.')
              }
            />
          )}

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
          <CardDescription>
            검색어나 유튜브 영상 ID 로 직접 추가할 수 있습니다. 스트리머가 추가하는 곡에는 신청
            제한(길이·1인 1곡 등)이 적용되지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddSongForm
            pending={addToQueue.isPending}
            onSubmit={(query) => run(addToQueue.mutateAsync({ query }), '대기열에 추가했습니다.')}
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-32">신청자</TableHead>
                <TableHead className="w-44 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
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
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="위로"
                        disabled={index === 0 || moveInQueue.isPending}
                        onClick={() =>
                          run(
                            moveInQueue.mutateAsync({ id: song.id, direction: 'up' }),
                            '순서를 옮겼습니다.',
                          )
                        }
                      >
                        <ChevronUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="아래로"
                        disabled={index === queue.length - 1 || moveInQueue.isPending}
                        onClick={() =>
                          run(
                            moveInQueue.mutateAsync({ id: song.id, direction: 'down' }),
                            '순서를 옮겼습니다.',
                          )
                        }
                      >
                        <ChevronDown />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="바로 재생"
                        title="바로 재생"
                        onClick={() =>
                          run(
                            playNow.mutateAsync({ id: song.id }),
                            `${song.title} 재생을 시작합니다.`,
                          )
                        }
                      >
                        <PlayCircle />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="삭제"
                        className="text-destructive"
                        onClick={() =>
                          run(
                            removeFromQueue.mutateAsync({ id: song.id }),
                            '대기열에서 삭제했습니다.',
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
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

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 진행률 — 서버는 5초마다 위치를 받으므로 그 사이는 클라이언트에서 보간한다.
 * 막대를 클릭하면 해당 지점으로 시크한다.
 */
function ProgressBar({
  positionSeconds,
  durationSeconds,
  playing,
  onSeek,
}: {
  positionSeconds: number;
  durationSeconds: number;
  playing: boolean;
  onSeek: (seconds: number) => void;
}) {
  const [position, setPosition] = useState(positionSeconds);

  useEffect(() => setPosition(positionSeconds), [positionSeconds]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setPosition((prev) => Math.min(durationSeconds, prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [playing, durationSeconds]);

  const ratio = durationSeconds > 0 ? Math.min(1, position / durationSeconds) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
        {formatTime(position)}
      </span>
      <button
        type="button"
        aria-label="재생 위치 이동"
        className="h-2 flex-1 cursor-pointer rounded-full bg-muted"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const clicked = ((event.clientX - rect.left) / rect.width) * durationSeconds;
          onSeek(Math.max(0, Math.min(durationSeconds, Math.round(clicked))));
        }}
      >
        <span
          className="block h-2 rounded-full bg-primary transition-[width]"
          style={{ width: `${ratio * 100}%` }}
        />
      </button>
      <span className="w-12 text-xs tabular-nums text-muted-foreground">
        {formatTime(durationSeconds)}
      </span>
    </div>
  );
}

function AddSongForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (query: string) => void;
}) {
  const [query, setQuery] = useState('');

  return (
    <form
      className="mb-4 flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!query.trim()) return;
        onSubmit(query.trim());
        setQuery('');
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="검색어 또는 유튜브 영상 ID"
      />
      <Button type="submit" disabled={pending || !query.trim()}>
        추가
      </Button>
    </form>
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
