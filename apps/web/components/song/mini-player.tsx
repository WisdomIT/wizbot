'use client';

import { ListMusic, Maximize2, Music, Pause, Play, Repeat1, SkipForward, Volume2 } from 'lucide-react';

import { formatTime, type PlaybackView, type PlayerControls } from '@/components/song/song-player';
import { Button } from '@/components/ui/button';

import { AppTitleBar } from './app-title-bar';
import { DRAG, NO_DRAG } from './drag-region';

/**
 * 미니 플레이어 (#97 #85).
 *
 * 앱을 작게 띄웠을 때의 화면. 컨트롤러는 위에 고정되고 대기열만 스크롤된다.
 * 볼륨·구간 이동을 뺀 나머지는 전부 창을 끄는 손잡이가 된다.
 */
interface MiniQueueItem {
  id: number;
  title: string;
  videoUploader: string;
  requester: string;
}

function thumbnailFor(youtubeId: string) {
  return `https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`;
}

export function MiniPlayer({
  playback,
  controls,
  queue,
  position,
  queueOpen,
  onToggleQueue,
  onExpand,
  platform,
  windowControls,
}: {
  playback: PlaybackView;
  controls: PlayerControls;
  queue: MiniQueueItem[];
  /** 보간된 재생 위치와 시크 핸들러는 상위에서 넘긴다 */
  position: { value: number; onScrub: (seconds: number) => void; onCommit: () => void };
  queueOpen: boolean;
  onToggleQueue: () => void;
  onExpand: () => void;
  platform: string;
  windowControls?: { minimize: () => void; toggleMaximize: () => void; close: () => void };
}) {
  const playing = playback.status === 'PLAYING';

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background" style={DRAG}>
      {/* macOS 는 신호등 버튼 자리를, Windows 는 우리 창 제어 버튼을 여기에 둔다 */}
      <AppTitleBar platform={platform} controls={windowControls} canMaximize={false} compact />

      <div className="flex shrink-0 flex-col gap-2 p-3 pt-0">
        <div className="flex items-center gap-2">
          <div className="size-11 shrink-0 overflow-hidden rounded bg-muted">
            {playback.youtubeId ? (
              /* 유튜브 CDN 썸네일 — 다른 원격 이미지와 같은 방식 */
              <img src={thumbnailFor(playback.youtubeId)} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Music className="size-4" />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {playback.title ?? '재생 중인 곡이 없습니다.'}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {playback.videoUploader}
              {playback.requester ? ` · ${playback.requester}` : ''}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5" style={NO_DRAG}>
            <Button
              variant={queueOpen ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="대기열"
              title="대기열"
              aria-pressed={queueOpen}
              onClick={onToggleQueue}
            >
              <ListMusic />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="큰 창 모드"
              title="큰 창 모드"
              onClick={onExpand}
            >
              <Maximize2 />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
            {formatTime(position.value)}
          </span>
          <input
            type="range"
            aria-label="재생 위치"
            min={0}
            max={Math.max(1, playback.durationSeconds)}
            value={Math.min(position.value, playback.durationSeconds)}
            disabled={!playback.title}
            onChange={(event) => position.onScrub(Number(event.target.value))}
            onPointerUp={position.onCommit}
            onKeyUp={position.onCommit}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:cursor-default"
            style={NO_DRAG}
          />
          <span className="w-8 text-[10px] tabular-nums text-muted-foreground">
            {formatTime(playback.durationSeconds)}
          </span>
        </div>

        <div className="flex items-center gap-1" style={NO_DRAG}>
          <Button
            size="icon"
            className="size-9 rounded-full"
            aria-label={playing ? '일시정지' : '재생'}
            onClick={playing ? controls.onPause : controls.onPlay}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button variant="ghost" size="icon" aria-label="다음 곡" onClick={controls.onNext}>
            <SkipForward />
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

          <Volume2 className="ml-1 size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            aria-label="볼륨"
            min={0}
            max={100}
            defaultValue={controls.volume}
            onMouseUp={(event) => controls.onVolume(Number(event.currentTarget.value))}
            onTouchEnd={(event) => controls.onVolume(Number(event.currentTarget.value))}
            onKeyUp={(event) => controls.onVolume(Number(event.currentTarget.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
        </div>
      </div>

      {queueOpen && (
        <ul className="min-h-0 flex-1 overflow-y-auto border-t" style={NO_DRAG}>
          {queue.length === 0 ? (
            <li className="p-3 text-center text-xs text-muted-foreground">대기열이 비어 있습니다.</li>
          ) : (
            queue.map((song) => (
              <li key={song.id} className="flex items-center gap-2 border-b px-3 py-2 last:border-0">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs">{song.title}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {song.videoUploader}
                  </span>
                </div>
                <span className="w-14 shrink-0 truncate text-right text-[10px] text-muted-foreground">
                  {song.requester}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
