'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eraser, GripVertical, Heart, Minimize2, PlayCircle, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { AppTitleBar } from '@/components/song/app-title-bar';
import { MiniPlayer } from '@/components/song/mini-player';
import { formatTime, SongPlayer, usePlayerPosition } from '@/components/song/song-player';
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
import { useAppShell } from '@/src/hooks/use-app-shell';
import { useSongEvents } from '@/src/hooks/use-song-events';
import { useTRPC } from '@/src/utils/trpc-react';

import { SettingsDialog } from './settings-dialog';

/**
 * 뮤직플레이어 = 컨트롤러 (#5 #97).
 * 이 페이지는 소리를 내지 않는다 — 실제 재생은 OBS 브라우저 소스(또는 앱)가 담당한다.
 */
export function PlayerView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    ...trpc.song.getState.queryOptions(),
    // SSE 가 주된 경로다. 이건 프록시 계층에서 이벤트가 조용히 새는 경우를 대비한 백스톱
    refetchInterval: 10_000,
  });

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries(trpc.song.getState.queryFilter()),
    [queryClient, trpc],
  );

  useSongEvents((event) => {
    // SSE 가 끊겨 있던 동안의 이벤트는 재전송되지 않는다.
    // 재연결(connected)이 곧 유실 구간의 끝이므로 이때 전체를 다시 읽는다.
    if (
      event.type === 'connected' ||
      event.type === 'playback' ||
      event.type === 'queue' ||
      event.type === 'source'
    ) {
      invalidate();
    }
  });

  const play = useMutation(trpc.song.play.mutationOptions());
  const pause = useMutation(trpc.song.pause.mutationOptions());
  const stop = useMutation(trpc.song.stop.mutationOptions());
  const next = useMutation(trpc.song.next.mutationOptions());
  const seek = useMutation(trpc.song.seek.mutationOptions());
  const setVolume = useMutation(trpc.song.setVolume.mutationOptions());
  const setRepeat = useMutation(trpc.song.setRepeat.mutationOptions());
  const setSourceType = useMutation(trpc.song.setSourceType.mutationOptions());
  const regenerate = useMutation(trpc.song.regenerateToken.mutationOptions());
  const setOverlaySettings = useMutation(trpc.song.setOverlaySettings.mutationOptions());
  const setHistoryPublic = useMutation(trpc.song.setHistoryPublic.mutationOptions());
  const setAutoPlay = useMutation(trpc.songFavorite.setAutoPlay.mutationOptions());
  const addToQueue = useMutation(trpc.song.addToQueue.mutationOptions());
  const reorderQueue = useMutation(trpc.song.reorderQueue.mutationOptions());
  const removeFromQueue = useMutation(trpc.song.removeFromQueue.mutationOptions());
  const clearQueue = useMutation(trpc.song.clearQueue.mutationOptions());
  const playNow = useMutation(trpc.song.playNow.mutationOptions());
  const addCurrentToFavorite = useMutation(trpc.song.addCurrentToFavorite.mutationOptions());
  const updateUserSetting = useMutation(trpc.user.updateUserSetting.mutationOptions());
  const setShortcuts = useMutation(trpc.song.setShortcuts.mutationOptions());

  const shell = useAppShell();

  // 미니 플레이어는 창이 작아 토스트가 화면을 통째로 덮는다 — 조용히 처리한다
  const quiet = shell.isApp && shell.mode === 'mini';

  const run = useCallback(
    (promise: Promise<unknown>, success: string) => {
      if (quiet) {
        promise.then(invalidate).catch(invalidate);
        return;
      }

      toast.promise(promise, {
        loading: '처리 중...',
        success: () => {
          invalidate();
          return success;
        },
        error: (err) => `${err instanceof Error ? err.message : err}`,
      });
    },
    [invalidate, quiet],
  );

  // 데스크톱·미니가 같은 재생 위치를 보도록 여기서 한 번만 만든다
  const position = usePlayerPosition(
    data?.playback.positionSeconds ?? 0,
    data?.playback.durationSeconds ?? 0,
    data?.playback.status === 'PLAYING',
    (seconds) => run(seek.mutateAsync({ positionSeconds: seconds }), '재생 위치를 옮겼습니다.'),
  );

  if (isPending) {
    return (
      <div className="grid gap-4 py-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Skeleton className="h-[28rem] w-full" />
        <Skeleton className="h-[28rem] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">불러오지 못했습니다: {error.message}</div>
    );
  }

  const { playback, queue, source, historyPublic, autoPlay } = data;

  const playerControls = {
    volume: playback.volume,
    repeatOne: playback.repeatOne,
    onPlay: () => run(play.mutateAsync(), '재생을 시작했습니다.'),
    onPause: () => run(pause.mutateAsync(), '일시정지했습니다.'),
    onNext: () => run(next.mutateAsync(), '다음 곡으로 넘겼습니다.'),
    onStop: () => run(stop.mutateAsync(), '정지했습니다.'),
    onSeek: (seconds: number) =>
      run(seek.mutateAsync({ positionSeconds: seconds }), '재생 위치를 옮겼습니다.'),
    onVolume: (volume: number) =>
      run(setVolume.mutateAsync({ volume }), `볼륨을 ${volume} 로 변경했습니다.`),
    onRepeat: (enabled: boolean) =>
      run(
        setRepeat.mutateAsync({ enabled }),
        enabled ? '한 곡 반복을 켰습니다.' : '한 곡 반복을 껐습니다.',
      ),
  };

  // 앱을 작게 띄웠을 때 — 컨트롤러만 남고 대기열은 버튼으로 여닫는다
  if (shell.isApp && shell.mode === 'mini') {
    return (
      <MiniPlayer
        playback={playback}
        controls={playerControls}
        queue={queue}
        position={position}
        queueOpen={shell.queueOpen}
        onToggleQueue={() => shell.setQueueOpen(!shell.queueOpen)}
        onExpand={() => shell.setMode('desktop')}
        onPlaySong={(song) =>
          run(playNow.mutateAsync({ id: song.id }), `${song.title} 재생을 시작합니다.`)
        }
        platform={shell.platform}
        windowControls={shell.windowControls}
      />
    );
  }

  return (
    // 앱에서는 웹 페이지가 아니라 창처럼 동작해야 한다 —
    // 전체가 화면 높이에 맞고, 스크롤은 대기열 표 안에서만 일어난다
    <div
      className={
        shell.isApp
          ? 'flex h-svh flex-col overflow-hidden'
          : 'flex flex-col gap-4 py-4'
      }
    >
      {shell.isApp && (
        <AppTitleBar
          platform={shell.platform}
          controls={shell.windowControls}
          title="wizbot player"
          className="border-b"
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label="미니 플레이어"
            title="미니 플레이어"
            onClick={() => shell.setMode('mini')}
          >
            <Minimize2 />
          </Button>
        </AppTitleBar>
      )}

      {shell.isApp ? (
        <div className="px-4 pt-3">
          <SourceStatus source={source} />
        </div>
      ) : (
        <SourceStatus source={source} />
      )}

      {/* 큰 화면은 좌측 플레이어 · 우측 대기열, 작은 화면은 플레이어가 위 */}
      <div
        className={
          shell.isApp
            ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-4 overflow-hidden px-4 pt-3 pb-4'
            : 'grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]'
        }
      >
        <div className={shell.isApp ? 'min-h-0 overflow-y-auto' : undefined}>
        <SongPlayer
          playback={playback}
          position={position}
          controls={playerControls}
          actions={
            <div className="flex items-center gap-1 rounded-full bg-background/80 backdrop-blur">
              {playback.youtubeId && (
                <AddToFavoriteButton
                  onAdd={(favoriteId) =>
                    run(addCurrentToFavorite.mutateAsync({ favoriteId }), '즐겨찾기에 담았습니다.')
                  }
                />
              )}
              <SettingsDialog
                settings={{
                  sourceType: source.sourceType,
                  sourceToken: source.sourceToken,
                  overlay: source.overlay,
                  autoPlay,
                  historyPublic,
                  keyboardShortcut: data.keyboardShortcut,
                  shortcuts: data.shortcuts,
                }}
                onChangeSourceType={(sourceType) =>
                  run(setSourceType.mutateAsync({ sourceType }), '송출 소스를 변경했습니다.')
                }
                onRegenerate={() =>
                  run(
                    regenerate.mutateAsync({ kind: 'source' }),
                    '주소를 새로 발급했습니다. OBS 에 다시 붙여넣으세요.',
                  )
                }
                onChangeOverlay={(overlay) =>
                  run(setOverlaySettings.mutateAsync(overlay), '자막 설정을 저장했습니다.')
                }
                onChangeAutoPlay={(enabled) =>
                  run(
                    setAutoPlay.mutateAsync({ enabled }),
                    enabled ? '자동 재생을 켰습니다.' : '자동 재생을 껐습니다.',
                  )
                }
                onChangeHistoryPublic={(isPublic) =>
                  run(
                    setHistoryPublic.mutateAsync({ isPublic }),
                    isPublic ? '재생 기록을 공개합니다.' : '재생 기록을 비공개로 바꿨습니다.',
                  )
                }
                onChangeShortcuts={(shortcuts) =>
                  run(setShortcuts.mutateAsync(shortcuts), '단축키를 바꿨습니다.')
                }
                autoLaunch={
                  shell.isApp
                    ? { enabled: shell.autoLaunch, onChange: shell.setAutoLaunch }
                    : undefined
                }
                youtube={shell.youtube}
                onChangeKeyboardShortcut={(enabled) =>
                  run(
                    updateUserSetting.mutateAsync({
                      setting: { songKeyboardShortcut: enabled },
                    }),
                    enabled ? '전역 단축키를 켰습니다.' : '전역 단축키를 껐습니다.',
                  )
                }
              />
            </div>
          }
        />

        </div>

        <QueueCard
          queue={queue}
          fill={shell.isApp}
          addPending={addToQueue.isPending}
          onAdd={(query) => run(addToQueue.mutateAsync({ query }), '대기열에 추가했습니다.')}
          onReorder={(orderedIds) => {
            reorderQueue.mutateAsync({ orderedIds }).catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : '순서를 바꾸지 못했습니다.');
              invalidate();
            });
          }}
          onPlayNow={(song) =>
            run(playNow.mutateAsync({ id: song.id }), `${song.title} 재생을 시작합니다.`)
          }
          onRemove={(song) =>
            run(removeFromQueue.mutateAsync({ id: song.id }), '대기열에서 삭제했습니다.')
          }
          onClear={() =>
            run(clearQueue.mutateAsync(), '대기열을 비웠습니다.')
          }
        />
      </div>
    </div>
  );
}

/**
 * 송출 소스 연결 상태.
 * 서버는 조회 시점에 online 을 계산해 주지만, 소스가 끊기면 하트비트도 멈춰서
 * 다시 조회할 계기가 사라진다. 마지막 하트비트 시각과 타임아웃으로 여기서 센다.
 */
const SOURCE_LABEL = {
  NONE: '사용 안 함',
  OBS: 'OBS 브라우저 소스',
  ELECTRON: '위즈봇 플레이어 앱',
} as const;

function SourceStatus({
  source,
}: {
  source: {
    sourceType: 'NONE' | 'OBS' | 'ELECTRON';
    online: boolean;
    lastSeenAt: string | Date | null;
    timeoutMs: number;
  };
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (source.sourceType === 'NONE') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">송출 소스 사용 안 함</Badge>
        설정에서 OBS 또는 앱을 선택하세요.
      </div>
    );
  }

  const online =
    source.online &&
    !!source.lastSeenAt &&
    now - new Date(source.lastSeenAt).getTime() <= source.timeoutMs;

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {online ? <Badge>연결됨</Badge> : <Badge variant="destructive">연결 안 됨</Badge>}
      {online
        ? `${SOURCE_LABEL[source.sourceType]} 에서 재생 중입니다.`
        : '송출 소스가 연결되어 있지 않습니다. 재생해도 소리가 나지 않습니다.'}
    </div>
  );
}

interface QueueItem {
  id: number;
  title: string;
  videoUploader: string;
  requester: string;
  durationSeconds: number;
}

/** 대기열 — 순서는 왼쪽 핸들을 잡고 드래그해서 바꾼다 */
function QueueCard({
  queue,
  addPending,
  fill,
  onAdd,
  onReorder,
  onPlayNow,
  onRemove,
  onClear,
}: {
  queue: QueueItem[];
  /** 앱에서는 카드가 높이를 채우고 표 안에서만 스크롤한다 */
  fill?: boolean;
  addPending: boolean;
  onAdd: (query: string) => void;
  onReorder: (orderedIds: number[]) => void;
  onPlayNow: (song: QueueItem) => void;
  onRemove: (song: QueueItem) => void;
  onClear: () => void;
}) {
  // 드래그 직후 서버 응답을 기다리지 않고 바로 보여주기 위해 로컬 사본을 둔다
  const [items, setItems] = useState(queue);
  const [clearing, setClearing] = useState(false);
  useEffect(() => setItems(queue), [queue]);

  const sensors = useSensors(
    // 살짝 눌린 정도로는 드래그가 시작되지 않게 — 삭제/재생 버튼 클릭을 방해하지 않는다
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    onReorder(next.map((item) => item.id));
  };

  return (
    <Card className={fill ? 'flex h-full min-h-0 flex-col gap-3 py-3' : undefined}>
      {!fill && (
        <CardHeader>
          <CardTitle>대기열 {items.length > 0 && `(${items.length})`}</CardTitle>
          <CardDescription>
            검색어나 유튜브 주소로 직접 추가할 수 있습니다. 스트리머가 추가하는 곡에는 신청
            제한(길이·1인 1곡 등)이 적용되지 않습니다. 순서는 핸들을 잡고 끌어서 바꿉니다.
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className={fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : undefined}>
        <div className="mb-4 flex items-center gap-2">
          <AddSongForm pending={addPending} onSubmit={onAdd} />
          <Button
            variant="outline"
            className="shrink-0 text-destructive"
            disabled={items.length === 0}
            onClick={() => setClearing(true)}
          >
            <Eraser /> 비우기
          </Button>
        </div>

        <ConfirmDialog
          open={clearing}
          title="대기열을 비울까요?"
          description={`대기 중인 ${items.length}곡이 모두 삭제됩니다. 되돌릴 수 없습니다. (재생 중인 곡은 그대로입니다)`}
          confirmLabel="비우기"
          onCancel={() => setClearing(false)}
          onConfirm={() => {
            setClearing(false);
            onClear();
          }}
        />
        <div className={fill ? 'flex min-h-0 flex-1 flex-col' : undefined}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <div className={fill ? 'min-h-0 flex-1 overflow-y-auto' : undefined}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">#</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-28">신청자</TableHead>
                <TableHead className="w-16 text-right">길이</TableHead>
                <TableHead className="w-24 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                    대기열이 비어 있습니다.
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext
                  items={items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((song, index) => (
                    <SortableSongRow
                      key={song.id}
                      song={song}
                      index={index}
                      onPlayNow={() => onPlayNow(song)}
                      onRemove={() => onRemove(song)}
                    />
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
          </div>
        </DndContext>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableSongRow({
  song,
  index,
  onPlayNow,
  onRemove,
}: {
  song: QueueItem;
  index: number;
  onPlayNow: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: song.id });

  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        // 끌고 있는 행이 다른 행에 가리지 않도록
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={isDragging ? 'bg-muted' : undefined}
    >
      <TableCell>
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`${song.title} 순서 변경`}
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <span className="tabular-nums">{index + 1}</span>
        </div>
      </TableCell>
      {/* 제목은 줄바꿈시킨다 — nowrap 이면 긴 제목이 표를 밀어내 오른쪽 「관리」 열이 잘린다 */}
      <TableCell className="break-words whitespace-normal">
        <div className="flex flex-col">
          <span>{song.title}</span>
          <span className="text-xs text-muted-foreground">{song.videoUploader}</span>
        </div>
      </TableCell>
      <TableCell className="break-words whitespace-normal">{song.requester}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatTime(song.durationSeconds)}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <Button
          variant="ghost"
          size="icon"
          aria-label="바로 재생"
          title="바로 재생"
          onClick={onPlayNow}
        >
          <PlayCircle />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="삭제"
          className="text-destructive"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </TableCell>
    </TableRow>
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
      className="flex flex-1 items-center gap-2"
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
        placeholder="검색어 또는 유튜브 주소"
      />
      <Button type="submit" disabled={pending || !query.trim()}>
        추가
      </Button>
    </form>
  );
}

/** 지금 재생 중인 곡을 즐겨찾기에 담는다 */
function AddToFavoriteButton({ onAdd }: { onAdd: (favoriteId: number) => void }) {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.songFavorite.list.queryOptions());
  const favorites = data?.favorites ?? [];

  if (favorites.length === 0) return null;

  // 즐겨찾기가 하나뿐이면 고를 것도 없다
  if (favorites.length === 1) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="즐겨찾기에 담기"
        title="즐겨찾기에 담기"
        onClick={() => onAdd(favorites[0]!.id)}
      >
        <Heart />
      </Button>
    );
  }

  return (
    <Select onValueChange={(value) => onAdd(Number(value))}>
      <SelectTrigger className="h-9 w-9 border-0 p-0 shadow-none [&>svg:last-child]:hidden">
        <SelectValue placeholder={<Heart className="size-4" />} />
      </SelectTrigger>
      <SelectContent>
        {favorites.map((favorite) => (
          <SelectItem key={favorite.id} value={String(favorite.id)}>
            {favorite.name}
            {favorite.isDefault ? ' (대표)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
