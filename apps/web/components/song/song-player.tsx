'use client';

import { Music, Pause, Play, Repeat1, SkipForward, Square, Volume2 } from 'lucide-react';
import { type ReactNode,useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface PlaybackView {
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
  youtubeId: string | null;
  title: string | null;
  videoUploader: string | null;
  requester: string | null;
  durationSeconds: number;
  positionSeconds: number;
}

export interface PlayerControls {
  volume: number;
  repeatOne: boolean;
  autoPlay: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onStop: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (volume: number) => void;
  onRepeat: (enabled: boolean) => void;
  onAutoPlay: (enabled: boolean) => void;
}

export function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 썸네일은 저장하지 않고 영상 ID 로 만든다 */
function thumbnailFor(youtubeId: string) {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

/**
 * 뮤직플레이어 (#97).
 * 스트리머 콘솔은 조작 가능하게, 시청자 화면은 controls 없이 상태만 보이게 쓴다.
 * 어느 쪽도 소리를 내지 않는다 — 재생은 송출 소스(OBS·앱)가 담당한다.
 */
export function SongPlayer({
  playback,
  controls,
  actions,
}: {
  playback: PlaybackView;
  /** 없으면 읽기 전용 */
  controls?: PlayerControls;
  /** 우상단 슬롯 (설정 버튼 등) */
  actions?: ReactNode;
}) {
  const playing = playback.status === 'PLAYING';
  const serverPosition = useInterpolatedPosition(
    playback.positionSeconds,
    playback.durationSeconds,
    playing,
  );
  const { position, onScrub, onCommit } = useScrubbable(serverPosition, controls?.onSeek);

  return (
    <Card className="overflow-hidden">
      {/* 좁으면(앱의 미니 플레이어) 썸네일이 작아지며 옆으로 눕는다 */}
      <CardContent className="flex flex-col gap-4 max-[479px]:gap-2">
        <div className="flex flex-col gap-4 max-[479px]:flex-row max-[479px]:items-center max-[479px]:gap-3">
          <div className="aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-muted max-[479px]:size-12 max-[479px]:aspect-square">
            {playback.youtubeId ? (
              /* 유튜브 CDN 썸네일 — 다른 원격 이미지와 같은 방식 */
              <img
                src={thumbnailFor(playback.youtubeId)}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Music className="size-10 max-[479px]:size-5" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 truncate font-bold">
                {playback.title ?? '재생 중인 곡이 없습니다.'}
                {playback.status === 'PAUSED' && <Badge variant="secondary">일시정지</Badge>}
              </span>
              <span className="truncate text-sm text-muted-foreground">
                {playback.videoUploader}
                {playback.requester ? ` · 신청: ${playback.requester}` : ''}
              </span>
            </div>
            {actions && <div className="flex shrink-0 items-center">{actions}</div>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {formatTime(position)}
          </span>
          <input
            type="range"
            aria-label="재생 위치"
            min={0}
            max={Math.max(1, playback.durationSeconds)}
            value={Math.min(position, playback.durationSeconds)}
            disabled={!controls || !playback.title}
            onChange={(event) => onScrub(Number(event.target.value))}
            onPointerUp={onCommit}
            onKeyUp={onCommit}
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-default"
          />
          <span className="w-10 text-xs tabular-nums text-muted-foreground">
            {formatTime(playback.durationSeconds)}
          </span>
        </div>

        {controls ? (
          <>
            <div className="flex items-center justify-center gap-2 max-[479px]:gap-1">
              <Button
                size="icon"
                className="size-12 rounded-full max-[479px]:size-10"
                aria-label={playing ? '일시정지' : '재생'}
                onClick={playing ? controls.onPause : controls.onPlay}
              >
                {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="다음 곡" onClick={controls.onNext}>
                <SkipForward />
              </Button>
              <Button variant="ghost" size="icon" aria-label="정지" onClick={controls.onStop}>
                <Square />
              </Button>
              <Button
                variant={controls.repeatOne ? 'secondary' : 'ghost'}
                size="icon"
                aria-label="한 곡 반복"
                title="한 곡 반복"
                aria-pressed={controls.repeatOne}
                onClick={() => controls.onRepeat(!controls.repeatOne)}
              >
                <Repeat1 />
              </Button>
            </div>

            <div className="flex items-center gap-2 max-[479px]:hidden">
              <Volume2 className="size-4 text-muted-foreground" />
              <input
                type="range"
                aria-label="볼륨"
                min={0}
                max={100}
                defaultValue={controls.volume}
                onMouseUp={(event) => controls.onVolume(Number(event.currentTarget.value))}
                onTouchEnd={(event) => controls.onVolume(Number(event.currentTarget.value))}
                onKeyUp={(event) => controls.onVolume(Number(event.currentTarget.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
              />
              <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                {controls.volume}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-3 max-[479px]:hidden">
              <Label htmlFor="player-autoplay" className="text-sm font-normal">
                대기열이 비면 대표 즐겨찾기에서 이어 재생
              </Label>
              <Switch
                id="player-autoplay"
                checked={controls.autoPlay}
                onCheckedChange={controls.onAutoPlay}
              />
            </div>
          </>
        ) : (
          <p className="text-center text-xs text-muted-foreground">
            {playing ? '방송에서 재생 중입니다.' : '재생 중인 곡이 없습니다.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * 손잡이를 잡고 있는 동안은 사용자 입력이 우선이다.
 *
 * 서버 위치를 그대로 그리면, 놓은 뒤에도 송출 소스가 새 위치를 보고할 때까지(최대 5초)
 * 손잡이가 원래 자리로 튕겨 돌아간다. 놓은 값을 잠시 붙들고 있다가
 * 서버가 따라오면 그때 넘긴다.
 */
const SEEK_SETTLE_MS = 6_000;
const SEEK_MATCH_SECONDS = 3;

function useScrubbable(serverPosition: number, onSeek?: (seconds: number) => void) {
  const [pending, setPending] = useState<{ value: number; at: number } | null>(null);

  // 서버가 내가 옮긴 위치를 따라잡았거나, 너무 오래 기다렸으면 서버 값으로 돌아간다
  useEffect(() => {
    if (!pending) return;
    if (Math.abs(serverPosition - pending.value) <= SEEK_MATCH_SECONDS) setPending(null);
  }, [serverPosition, pending]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), SEEK_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  const [dragging, setDragging] = useState<number | null>(null);

  return {
    position: dragging ?? pending?.value ?? serverPosition,
    onScrub: (value: number) => setDragging(value),
    onCommit: () => {
      if (dragging === null) return;
      setPending({ value: dragging, at: Date.now() });
      setDragging(null);
      onSeek?.(dragging);
    },
  };
}

/** 서버는 5초마다 위치를 받으므로 그 사이는 클라이언트에서 보간한다 */
function useInterpolatedPosition(positionSeconds: number, durationSeconds: number, playing: boolean) {
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

  return position;
}
