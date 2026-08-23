'use client';

import { Music, Pause, Play, SkipForward } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { PlaybackView } from '@/components/song/song-player';
import { Button } from '@/components/ui/button';

/**
 * 화면 하단에 붙는 재생 바 (#97).
 * 뮤직플레이어(또는 플레이리스트) 페이지가 아닌 곳에서 재생 중일 때 나타난다.
 * 소리는 나지 않는다 — 재생은 송출 소스가 담당하고 여기는 표시·조작용이다.
 */
export function PlayerBar({
  playback,
  href,
  controls,
}: {
  playback: PlaybackView;
  /** 제목을 누르면 이동할 곳 */
  href: string;
  /** 없으면 읽기 전용 */
  controls?: { onPlay: () => void; onPause: () => void; onNext: () => void };
}) {
  const playing = playback.status === 'PLAYING';
  const position = useInterpolatedPosition(
    playback.positionSeconds,
    playback.durationSeconds,
    playing,
  );

  const ratio =
    playback.durationSeconds > 0 ? Math.min(1, position / playback.durationSeconds) : 0;

  return (
    <div className="sticky bottom-0 z-30 mt-auto border-t bg-background/95 backdrop-blur">
      <div className="h-0.5 w-full bg-muted">
        <div
          className="h-0.5 bg-primary transition-[width]"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-2">
        <div className="size-10 shrink-0 overflow-hidden rounded bg-muted">
          {playback.youtubeId ? (
            /* 유튜브 CDN 썸네일 — 다른 원격 이미지와 같은 방식 */
            <img
              src={`https://i.ytimg.com/vi/${playback.youtubeId}/mqdefault.jpg`}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <Music className="size-4" />
            </div>
          )}
        </div>

        <Link href={href} className="flex min-w-0 flex-1 flex-col hover:underline">
          <span className="truncate text-sm font-medium">{playback.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {playback.videoUploader}
            {playback.requester ? ` · 신청: ${playback.requester}` : ''}
          </span>
        </Link>

        {controls ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              aria-label={playing ? '일시정지' : '재생'}
              onClick={playing ? controls.onPause : controls.onPlay}
            >
              {playing ? <Pause /> : <Play />}
            </Button>
            <Button size="icon" variant="ghost" aria-label="다음 곡" onClick={controls.onNext}>
              <SkipForward />
            </Button>
          </div>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">
            {playing ? '재생 중' : '일시정지'}
          </span>
        )}
      </div>
    </div>
  );
}

/** 서버는 5초마다 위치를 받으므로 그 사이는 클라이언트에서 보간한다 */
function useInterpolatedPosition(
  positionSeconds: number,
  durationSeconds: number,
  playing: boolean,
) {
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
