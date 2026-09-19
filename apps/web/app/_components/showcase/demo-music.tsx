'use client';

import { ListMusic } from 'lucide-react';
import { useCallback, useState } from 'react';

import { formatTime, type PlaybackView, SongPlayer, usePlayerPosition } from '@/components/song/song-player';

/**
 * 뮤직 플레이어 데모 (#277) — 콘솔의 실제 SongPlayer 컴포넌트를 로컬 상태로 돌린다. 재생을 누르면 타임라인이 흐르고,
 * 다음 곡을 누르면 대기열에서 꺼내 온다. 소리는 나지 않는다(실제 콘솔도 소리는 송출 소스가 낸다)
 */
type Song = { title: string; videoUploader: string; requester: string; durationSeconds: number };

const LIBRARY: Song[] = [
  { title: 'IU - Love wins all', videoUploader: '1theK (원더케이)', requester: '고정닉', durationSeconds: 245 },
  { title: 'NewJeans - Hype Boy', videoUploader: 'HYBE LABELS', requester: '밤샘코딩', durationSeconds: 179 },
  { title: 'aespa - Supernova', videoUploader: 'SMTOWN', requester: '치즈조각', durationSeconds: 178 },
  { title: '데이식스 - 한 페이지가 될 수 있게', videoUploader: 'JYP Entertainment', requester: '자동 재생', durationSeconds: 228 },
];

export function DemoMusic() {
  const [current, setCurrent] = useState(0);
  const [queue, setQueue] = useState<number[]>([1, 2, 3]);
  const [status, setStatus] = useState<PlaybackView['status']>('PAUSED');
  const [volume, setVolume] = useState(70);
  const [repeatOne, setRepeatOne] = useState(false);
  const [seekTo, setSeekTo] = useState(0);
  //  곡이 바뀌거나 시크할 때 보간 기준을 다시 잡기 위한 키
  const [epoch, setEpoch] = useState(0);

  const song = LIBRARY[current];
  const playback: PlaybackView = {
    status,
    youtubeId: null,
    title: song.title,
    videoUploader: song.videoUploader,
    requester: song.requester,
    durationSeconds: song.durationSeconds,
    positionSeconds: seekTo,
  };

  const next = useCallback(() => {
    setQueue((q) => {
      const [head, ...rest] = q;
      if (head === undefined) {
        setStatus('STOPPED');
        return q;
      }
      setCurrent((prev) => {
        // 지난 곡은 대기열 맨 뒤로 — 데모가 끊기지 않게
        setTimeout(() => setQueue((qq) => (qq.includes(prev) ? qq : [...qq, prev])), 0);
        return head;
      });
      setSeekTo(0);
      setEpoch((e) => e + 1);
      setStatus('PLAYING');
      return rest;
    });
  }, []);

  const position = usePlayerPosition(seekTo, song.durationSeconds, status === 'PLAYING', (seconds) => {
    setSeekTo(seconds);
    setEpoch((e) => e + 1);
  });
  //  끝까지 가면 다음 곡 (한 곡 반복이면 처음부터)
  if (status === 'PLAYING' && position.value >= song.durationSeconds) {
    if (repeatOne) {
      setSeekTo(0);
      setEpoch((e) => e + 1);
    } else {
      next();
    }
  }

  return (
    <div className="grid h-full gap-3 overflow-hidden bg-background p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]" key={epoch}>
      <SongPlayer
        playback={playback}
        position={position}
        controls={{
          volume,
          repeatOne,
          onPlay: () => setStatus('PLAYING'),
          onPause: () => setStatus('PAUSED'),
          onNext: next,
          onStop: () => {
            setStatus('STOPPED');
            setSeekTo(0);
            setEpoch((e) => e + 1);
          },
          onSeek: (seconds) => {
            setSeekTo(seconds);
            setEpoch((e) => e + 1);
          },
          onVolume: setVolume,
          onRepeat: setRepeatOne,
        }}
      />
      <div className="hidden min-h-0 flex-col rounded-lg border md:flex">
        <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold text-muted-foreground">
          <ListMusic className="size-3.5" /> 대기열 ({queue.length})
        </div>
        <ul className="min-h-0 flex-1 overflow-hidden text-xs">
          {queue.map((index, order) => (
            <li key={index} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
              <span className="w-3 text-muted-foreground tabular-nums">{order + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{LIBRARY[index].title}</span>
                <span className="truncate text-muted-foreground">{LIBRARY[index].requester}</span>
              </div>
              <span className="text-muted-foreground tabular-nums">{formatTime(LIBRARY[index].durationSeconds)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
