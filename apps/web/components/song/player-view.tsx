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
import { AppWindow, Copy, Download, Eraser, Eye, EyeOff, GripVertical, Heart, Minimize2, MonitorSpeaker, Play, PlayCircle, RadioTower, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { AppTitleBar } from '@/components/song/app-title-bar';
import { FavoriteHeartButton, type FavoriteHint, FavoriteHintBadge } from '@/components/song/favorite-heart-button';
import { FavoritePlayDialog } from '@/components/song/favorite-play-dialog';
import { MiniPlayer } from '@/components/song/mini-player';
import { formatTime, SongPlayer, usePlayerPosition } from '@/components/song/song-player';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { playDing } from '@/lib/ding';
import { useAppShell } from '@/src/hooks/use-app-shell';
import { useDefaultFavorite } from '@/src/hooks/use-default-favorite';
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
  const { data, isPending, error, dataUpdatedAt } = useQuery({
    ...trpc.song.getState.queryOptions(),
    // SSE 가 주된 경로다. 이건 프록시 계층에서 이벤트가 조용히 새는 경우를 대비한 백스톱
    refetchInterval: STATE_REFETCH_MS,
  });

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries(trpc.song.getState.queryFilter()),
    [queryClient, trpc],
  );

  const shell = useAppShell();
  /** 앱 안 안내 (#322) — 「찾기」·「송출 소스로 설정됨」. 미니는 화면을 덮는 오버레이, 큰 창은 toast */
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const notifyApp = useCallback(
    (text: string) => {
      if (shell.mode === 'mini') setAppNotice(text);
      else toast(text, { duration: 5000 });
    },
    [shell.mode],
  );

  const { connected } = useSongEvents((event) => {
    // 「찾기」 (#322) — 이 앱이면 작업 표시줄·독을 깜빡이고 띵동 3회 + 안내
    if (event.type === 'locate') {
      if (shell.sessionId && event.sessionId === shell.sessionId) {
        shell.attention();
        void playDing(3);
        notifyApp('이 앱이 찾기에 의해 호출됨');
      }
      return;
    }
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
  const selectSource = useMutation(trpc.song.selectSource.mutationOptions());
  const clearSourceSelection = useMutation(trpc.song.clearSourceSelection.mutationOptions());
  const locateSource = useMutation(trpc.song.locateSource.mutationOptions());
  const regenerate = useMutation(trpc.song.regenerateToken.mutationOptions());
  const setOverlaySettings = useMutation(trpc.song.setOverlaySettings.mutationOptions());
  const setHistoryPublic = useMutation(trpc.song.setHistoryPublic.mutationOptions());
  const setActive = useMutation(trpc.song.setActive.mutationOptions());
  const setRequestPolicy = useMutation(trpc.song.setRequestPolicy.mutationOptions());
  const setAutoPlay = useMutation(trpc.songFavorite.setAutoPlay.mutationOptions());
  const addToQueue = useMutation(trpc.song.addToQueue.mutationOptions());
  const reorderQueue = useMutation(trpc.song.reorderQueue.mutationOptions());
  const removeFromQueue = useMutation(trpc.song.removeFromQueue.mutationOptions());
  const clearQueue = useMutation(trpc.song.clearQueue.mutationOptions());
  const enqueueFavorite = useMutation(trpc.songFavorite.enqueue.mutationOptions());
  const playNow = useMutation(trpc.song.playNow.mutationOptions());
  const addCurrentToFavorite = useMutation(trpc.song.addCurrentToFavorite.mutationOptions());
  const dismissSuggestion = useMutation(trpc.suggestion.dismiss.mutationOptions());
  const updateUserSetting = useMutation(trpc.user.updateUserSetting.mutationOptions());
  const setShortcuts = useMutation(trpc.song.setShortcuts.mutationOptions());

  //  이 앱이 송출 소스로 「새로」 선택되면 알린다 (#322) — 처음 로드된 값은 건너뛴다(켤 때마다 뜨면 시끄럽다)
  const selectedSessionId = data?.source.selectedSessionId ?? null;
  const prevSelectedRef = useRef<string | null | undefined>(undefined);
  /* eslint-disable react-hooks/set-state-in-effect --
     서버 상태(선택된 세션)의 변화에 반응하는 알림이다. 렌더 중 비교로는 toast·소리를 낼 수 없어 effect 에서 1회 처리한다 */
  useEffect(() => {
    if (!data) return;
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedSessionId;
    if (prev === undefined || prev === selectedSessionId) return;
    if (shell.sessionId && selectedSessionId === shell.sessionId) {
      void playDing(1);
      notifyApp('이 앱이 송출 소스로 설정됨');
    }
  }, [data, selectedSessionId, shell.sessionId, notifyApp]);
  /* eslint-enable react-hooks/set-state-in-effect */

  //  미니 오버레이는 잠깐만
  useEffect(() => {
    if (!appNotice) return;
    const timer = setTimeout(() => setAppNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [appNotice]);

  // 미니 플레이어 하트 버튼의 대상 (#264) — 큰 창은 AddToFavoriteButton 이 따로 고른다
  const { defaultFavorite } = useDefaultFavorite();

  // 미니 플레이어는 창이 작아 토스트가 화면을 통째로 덮는다 — 조용히 처리한다
  const quiet = shell.isApp && shell.mode === 'mini';

  const run = useCallback(
    // success 에 함수를 주면 결과값으로 문구를 만든다 (추가된 곡 수 등)
    (promise: Promise<unknown>, success: string | ((result: never) => string)) => {
      if (quiet) {
        promise.then(invalidate).catch(invalidate);
        return;
      }

      toast.promise(promise, {
        loading: '처리 중...',
        success: (result) => {
          invalidate();
          return typeof success === 'string' ? success : success(result as never);
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

  const { playback, queue, source, historyPublic, autoPlay, currentInFavorites, favoriteSuggestion } = data;
  //  자주 들은 곡 배지 (#276) — 한 번 보면 그 곡에 대해 숨김. 담기면 서버가 조건 해제
  const favoriteHint: FavoriteHint | null =
    favoriteSuggestion && playback.youtubeId
      ? {
          text: `최근 ${favoriteSuggestion.count}번 재생`,
          onSeen: () => dismissSuggestion.mutate({ kind: 'FAVORITE_SONG', key: playback.youtubeId! }, { onSettled: invalidate }),
        }
      : null;

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
      <>
      {appNotice && <AppNoticeOverlay text={appNotice} />}
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
        favorite={
          defaultFavorite && {
            name: defaultFavorite.name,
            added: currentInFavorites.includes(defaultFavorite.id),
            hint: favoriteHint,
            onAdd: () =>
              run(
                addCurrentToFavorite.mutateAsync({ favoriteId: defaultFavorite.id }),
                `"${defaultFavorite.name}"에 담았습니다.`,
              ),
          }
        }
        platform={shell.platform}
        windowControls={shell.windowControls}
        update={shell.update}
        onApplyUpdate={shell.applyUpdate}
      />
      </>
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

      {/* 새 버전 안내 (#117) — 앱 안에서만. 트레이에도 있지만 눈에 띄는 곳에 함께 */}
      {shell.isApp && shell.update && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-md border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm">
          <span>새 버전 ({shell.update.version})이 나왔습니다.</span>
          <Button size="sm" onClick={shell.applyUpdate}>새 버전 ({shell.update.version}) 설치</Button>
        </div>
      )}

      <div className={shell.isApp ? 'flex flex-col gap-2 px-4 pt-3' : 'flex flex-col gap-2'}>
        <SourcePanel
          source={source}
          playback={playback}
          receivedAt={dataUpdatedAt}
          eventsConnected={connected}
          mySessionId={shell.sessionId}
          onSelect={(session) =>
            run(
              selectSource.mutateAsync({ sessionId: session.sessionId }),
              `${SESSION_LABEL[session.source]} · ${session.label} 을(를) 송출 소스로 설정했습니다.`,
            )
          }
          onLocate={(session) => run(locateSource.mutateAsync({ sessionId: session.sessionId }), `${SESSION_LABEL[session.source]} · ${session.label} 에 찾기 신호를 보냈습니다.`)}
          onClearSelection={() => run(clearSourceSelection.mutateAsync(), '송출 소스 선택을 해제했습니다. 소리가 나지 않습니다.')}
          onRegenerate={() =>
            run(
              regenerate.mutateAsync({ kind: 'source' }),
              '주소를 새로 발급했습니다. OBS 에 다시 붙여넣으세요.',
            )
          }
        />
        {playback.status === 'STOPPED' && playback.failStreak >= FAIL_STREAK_LIMIT && (
          <HaltedBanner reason={playback.lastFailReason} streak={playback.failStreak} onResume={playerControls.onPlay} />
        )}
      </div>

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
                  currentInFavorites={currentInFavorites}
                  hint={favoriteHint}
                  onAdd={(favorite) =>
                    run(
                      addCurrentToFavorite.mutateAsync({ favoriteId: favorite.id }),
                      `"${favorite.name}"에 담았습니다.`,
                    )
                  }
                />
              )}
              <SettingsDialog
                isApp={shell.isApp}
                settings={{
                  active: data.active,
                  requestPolicy: data.requestPolicy,
                  overlay: source.overlay,
                  autoPlay,
                  historyPublic,
                  keyboardShortcut: data.keyboardShortcut,
                  shortcuts: data.shortcuts,
                }}
                onChangeActive={(active) =>
                  run(
                    setActive.mutateAsync({ active }),
                    active ? '노래 신청 기능을 켰습니다.' : '노래 신청 기능을 껐습니다.',
                  )
                }
                onChangeRequestPolicy={(policy) =>
                  run(setRequestPolicy.mutateAsync(policy), '신청 제한을 저장했습니다.')
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
          onEnqueueFavorite={(id, shuffle) =>
            run(
              enqueueFavorite.mutateAsync({ id, shuffle }),
              (result: { added: number; skipped: number }) =>
                `${result.added}곡을 대기열에 추가했습니다.${
                  result.skipped > 0 ? ` (중복 ${result.skipped}곡 제외)` : ''
                }`,
            )
          }
        />
      </div>
    </div>
  );
}

/** 컨트롤러 상태 재조회 주기 — 연결 판정의 여유 시간에도 쓴다 */
const STATE_REFETCH_MS = 10_000;
/** 서버 playbackService.FAIL_STREAK_LIMIT 과 같다 (#319) */
const FAIL_STREAK_LIMIT = 3;
/** 재생을 눌렀는데 이만큼 지나도 송출 세션의 응답이 없으면 경고 (#322) */
const NO_RESPONSE_MS = 12_000;

const SESSION_LABEL = { OBS: 'OBS 브라우저 소스', ELECTRON: '플레이어 앱' } as const;

type SourceSession = { sessionId: string; source: 'OBS' | 'ELECTRON'; label: string; active: boolean; lastSeenAgoMs: number };

/**
 * 송출 패널 (#322).
 * 위: 앱 내려받기 · OBS 브라우저 소스 주소(둘 다 항상). 아래: 지금 연결된 세션 목록 — 하나를 골라 송출 소스로 삼고, 「찾기」로 어느 창인지 확인한다.
 *
 * 연결 판정: 예전엔 서버의 lastSeenAt 을 **이 PC 시계**로 빼서 시계 오차만큼 틀렸고, 조회 직전 값(최대 5초 묵음)에 재조회 대기 10초가 더해져
 * 타임아웃 15초 경계에 걸리면 「연결됨 ↔ 연결 안 됨」이 깜빡였다 (#319). 지금은 서버가 준 「몇 ms 전」에 응답 수신 후 경과 시간을 더해 세고,
 * 여유는 타임아웃 + 재조회 주기 — 하트비트가 정말 끊기면 늦어도 25초 안에 「연결 안 됨」이 된다.
 */
function SourcePanel({
  source,
  playback,
  receivedAt,
  eventsConnected,
  mySessionId,
  onSelect,
  onLocate,
  onClearSelection,
  onRegenerate,
}: {
  source: {
    selectedSessionId: string | null;
    sourceType: 'NONE' | 'OBS' | 'ELECTRON';
    sourceLabel: string | null;
    online: boolean;
    lastSeenAgoMs: number | null;
    sessions: SourceSession[];
    timeoutMs: number;
    sourceToken: string | null;
  };
  playback: { status: 'PLAYING' | 'PAUSED' | 'STOPPED'; playRequestedAt: string | Date | null; sourceAckAt: string | Date | null };
  /** getState 응답을 받은 시각 (react-query dataUpdatedAt) */
  receivedAt: number;
  /** 실시간(SSE) 연결이 살아 있는지 (#319) */
  eventsConnected: boolean;
  /** 앱 안이면 이 앱의 세션 ID — 목록에서 「이 앱」으로 표시 */
  mySessionId: string | null;
  onSelect: (session: SourceSession) => void;
  onLocate: (session: SourceSession) => void;
  onClearSelection: () => void;
  onRegenerate: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const sinceReceived = Math.max(0, now - receivedAt);
  const alive = (agoMs: number | null) => agoMs !== null && agoMs + sinceReceived <= source.timeoutMs + STATE_REFETCH_MS;
  const online = source.online && alive(source.lastSeenAgoMs);
  const sessions = source.sessions.filter((s) => alive(s.lastSeenAgoMs));
  const selected = source.selectedSessionId ? sessions.find((s) => s.sessionId === source.selectedSessionId) ?? null : null;

  //  재생을 눌렀는데 고른 세션이 켜져 있으면서도 응답(재생 시작·진행률)이 없다 (#322)
  const requestedAt = playback.playRequestedAt ? new Date(playback.playRequestedAt).getTime() : null;
  const ackedAt = playback.sourceAckAt ? new Date(playback.sourceAckAt).getTime() : null;
  const unresponsive =
    playback.status === 'PLAYING' && online && requestedAt !== null && (ackedAt === null || ackedAt < requestedAt) && now - requestedAt > NO_RESPONSE_MS;

  const events = (
    <span
      className="ml-auto flex items-center gap-1 text-xs"
      title={eventsConnected ? '실시간 연결됨 — 조작이 바로 반영됩니다' : '실시간 연결이 끊겨 다시 붙는 중 — 조작 반영이 몇 초 늦을 수 있습니다'}
    >
      <span className={`inline-block size-2 rounded-full ${eventsConnected ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`} />
      {eventsConnected ? '실시간' : '재연결 중'}
    </span>
  );

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-md border px-3 py-2">
          <AppWindow className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">플레이어 앱</span>
            <span className="text-xs text-muted-foreground">설치해 켜두면 아래 목록에 나타납니다. 전역 단축키·미니 플레이어 지원.</span>
          </div>
          {/* 앱 안에서 눌러도 setWindowOpenHandler 가 외부 브라우저로 넘긴다 */}
          <Button asChild size="sm" variant="outline">
            <a href="/download" target="_blank" rel="noreferrer">
              <Download /> 내려받기
            </a>
          </Button>
        </div>
        <ObsSourceCard token={source.sourceToken} onRegenerate={onRegenerate} />
      </div>

      <div className="flex items-center gap-2 text-muted-foreground">
        {source.selectedSessionId === null ? (
          <>
            <Badge variant="outline">송출 소스 없음</Badge>
            앱이나 OBS 브라우저 소스를 켜면 처음 연결된 것이 자동으로 선택됩니다.
          </>
        ) : online && selected ? (
          <>
            <Badge>연결됨</Badge>
            {SESSION_LABEL[selected.source]} · {selected.label} 에서 재생 중입니다.
          </>
        ) : (
          <>
            <Badge variant="destructive">연결 안 됨</Badge>
            선택한 {source.sourceType === 'NONE' ? '송출 소스' : SESSION_LABEL[source.sourceType]}
            {source.sourceLabel ? ` · ${source.sourceLabel}` : ''} 이(가) 켜져 있지 않습니다. 재생해도 소리가 나지 않습니다.
          </>
        )}
        {events}
      </div>

      {unresponsive && selected && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          송출 소스({SESSION_LABEL[selected.source]} · {selected.label})가 재생에 응답하지 않습니다. 「찾기」로 그 창을 확인하거나 앱·브라우저 소스를 다시 켜보세요.
        </div>
      )}

      {sessions.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {sessions.map((session) => (
            <li key={session.sessionId} className="flex items-center gap-3 px-3 py-2">
              {session.source === 'ELECTRON' ? <MonitorSpeaker className="size-4 shrink-0 text-muted-foreground" /> : <RadioTower className="size-4 shrink-0 text-muted-foreground" />}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">
                  {session.label}
                  <span className="ml-2 text-xs text-muted-foreground">{SESSION_LABEL[session.source]}</span>
                  {mySessionId === session.sessionId && <span className="ml-2 text-xs text-muted-foreground">(이 앱)</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {session.active ? <span className="text-emerald-600 dark:text-emerald-400">송출 중</span> : '대기'} · 마지막 신호 {Math.round((session.lastSeenAgoMs + sinceReceived) / 1000)}초 전
                </span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="찾기" onClick={() => onLocate(session)}>
                    <Eye />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>찾기 — {session.source === 'ELECTRON' ? '그 컴퓨터의 앱이 깜빡이고 띵동 소리가 납니다' : 'OBS 의 그 브라우저 소스가 빨갛게 빛나고 띵동 소리가 납니다'}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant={session.active ? 'default' : 'outline'} size="icon" aria-label="송출 소스로 설정" disabled={session.active} onClick={() => onSelect(session)}>
                    <Play />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{session.active ? '지금 송출 소스입니다' : `이 ${session.source === 'ELECTRON' ? '앱' : '브라우저 소스'}을(를) 송출 소스로 설정`}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      )}

      {source.selectedSessionId !== null && (
        <div>
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={onClearSelection}>
            송출 소스 선택 해제 (소리 끄기)
          </button>
        </div>
      )}
    </div>
  );
}

/** OBS 브라우저 소스 주소 — 보기/복사/재발급. 설정 다이얼로그에 있던 것을 옮겼다 (#322) */
function ObsSourceCard({ token, onRegenerate }: { token: string | null; onRegenerate: () => void }) {
  // 주소는 방송 화면에 그대로 찍힐 수 있으므로 기본은 가려둔다
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [origin, setOrigin] = useState('');
  useState(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  });
  const playerUrl = token ? `${origin}/obs/${token}/player` : '';

  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
      <RadioTower className="size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">OBS 브라우저 소스</span>
        <div className="flex items-center gap-1">
          <Input readOnly value={playerUrl} type={revealed ? 'text' : 'password'} className="h-8 font-mono text-xs" />
          <Button variant="ghost" size="icon" aria-label={revealed ? '주소 가리기' : '주소 보기'} title={revealed ? '주소 가리기' : '주소 보기'} onClick={() => setRevealed((prev) => !prev)}>
            {revealed ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="주소 복사"
            title="주소 복사"
            onClick={() => {
              void navigator.clipboard.writeText(playerUrl);
              toast.success('주소를 복사했습니다.');
            }}
          >
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="주소 재발급" title="주소 재발급" onClick={() => setConfirming(true)}>
            <RefreshCw />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">이 주소를 OBS 브라우저 소스로 추가하세요. 아는 사람은 재생 상태를 볼 수 있으니 방송에 노출됐다면 재발급.</span>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>주소를 새로 발급할까요?</DialogTitle>
            <DialogDescription>
              새 주소가 발급되면 <strong>기존 주소는 즉시 사용할 수 없게 됩니다.</strong> 이미 OBS 에 등록해 둔 브라우저 소스는 재생이 멈추므로, 새 주소를 다시 붙여넣어야 합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                setRevealed(false);
                onRegenerate();
              }}
            >
              새로 발급
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 미니 플레이어 위를 덮는 안내 (#322) — 「찾기」·「송출 소스로 설정됨」. 창이 작아 toast 대신 전체를 덮는다 */
function AppNoticeOverlay({ text }: { text: string }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 text-center text-base font-semibold ring-4 ring-inset ring-red-500">
      {text}
    </div>
  );
}

/** 연속 실패 차단기 (#319) — 곡이 아니라 환경 문제일 때 자동 재생이 즐겨찾기를 끝없이 소비하지 않도록 서버가 멈춘 상태 */
function HaltedBanner({ reason, streak, onResume }: { reason: string | null; streak: number; onResume: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
      <span>
        곡이 {streak}번 연속 재생되지 않아 멈췄습니다{reason ? ` (마지막 원인: ${reason})` : ''}. 재생 창의 유튜브 로그인·네트워크를 확인하고 다시 시작하세요.
      </span>
      <Button size="sm" className="ml-auto" onClick={onResume}>
        <Play /> 다시 시작
      </Button>
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
  onEnqueueFavorite,
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
  onEnqueueFavorite: (favoriteId: number, shuffle: boolean) => void;
}) {
  // 드래그 직후 서버 응답을 기다리지 않고 바로 보여주기 위해 로컬 사본을 둔다
  const [items, setItems] = useState(queue);
  const [clearing, setClearing] = useState(false);
  //  서버 큐를 로컬 사본에 반영 — effect 대신 렌더 중 보정 (#200)
  const [prevQueue, setPrevQueue] = useState(queue);
  if (queue !== prevQueue) {
    setPrevQueue(queue);
    setItems(queue);
  }

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
          <FavoritePlayDialog onEnqueue={onEnqueueFavorite} />
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
function AddToFavoriteButton({
  currentInFavorites,
  hint,
  onAdd,
}: {
  /** 지금 곡이 이미 담긴 즐겨찾기 id (#264) */
  currentInFavorites: number[];
  /** 자주 들은 곡 배지 (#276) */
  hint: FavoriteHint | null;
  onAdd: (favorite: { id: number; name: string }) => void;
}) {
  const { favorites, defaultFavorite } = useDefaultFavorite();

  if (!defaultFavorite) return null;

  // 즐겨찾기가 하나뿐이면 고를 것도 없다 — 미니 플레이어 하트와 같은 동작 (#264)
  if (favorites.length === 1) {
    return (
      <FavoriteHeartButton
        favorite={{
          name: defaultFavorite.name,
          added: currentInFavorites.includes(defaultFavorite.id),
          hint,
          onAdd: () => onAdd(defaultFavorite),
        }}
      />
    );
  }

  return (
    <FavoriteHintBadge hint={hint}>
    <Select
      onValueChange={(value) => {
        const favorite = favorites.find((candidate) => String(candidate.id) === value);
        if (favorite) onAdd(favorite);
      }}
    >
      <SelectTrigger className="h-9 w-9 border-0 p-0 shadow-none [&>svg:last-child]:hidden">
        <SelectValue placeholder={<Heart className="size-4" />} />
      </SelectTrigger>
      <SelectContent>
        {favorites.map((favorite) => (
          <SelectItem
            key={favorite.id}
            value={String(favorite.id)}
            disabled={currentInFavorites.includes(favorite.id)}
          >
            {favorite.name}
            {favorite.isDefault ? ' (대표)' : ''}
            {currentInFavorites.includes(favorite.id) ? ' · 담김' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    </FavoriteHintBadge>
  );
}
