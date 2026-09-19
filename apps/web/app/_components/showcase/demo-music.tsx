'use client';

import { useCallback, useState } from 'react';

import { MiniPlayer } from '@/components/song/mini-player';
import { type PlaybackView, usePlayerPosition } from '@/components/song/song-player';
import { SongOverlay } from '@/components/song/source-player';

/**
 * 뮤직 플레이어 데모 (#277) — 왼쪽은 데스크톱 앱의 **실제 미니 플레이어**(components/song/mini-player.tsx)를 로컬 상태로,
 * 오른쪽은 OBS 방송 화면 모사 위에 **실제 자막 컴포넌트**(SongOverlay)가 재생 중인 곡을 띄운다.
 * 재생을 누르면 타임라인이 흐르고 자막이 뜨며, 다음 곡은 대기열에서 꺼내 온다. 소리는 나지 않는다(실제로도 송출 소스가 낸다)
 */
type Song = { id: number; title: string; videoUploader: string; requester: string; durationSeconds: number };

const LIBRARY: Song[] = [
  { id: 1, title: 'IU - Love wins all', videoUploader: '1theK (원더케이)', requester: '고정닉', durationSeconds: 245 },
  { id: 2, title: 'NewJeans - Hype Boy', videoUploader: 'HYBE LABELS', requester: '밤샘코딩', durationSeconds: 179 },
  { id: 3, title: 'aespa - Supernova', videoUploader: 'SMTOWN', requester: '치즈조각', durationSeconds: 178 },
  { id: 4, title: '데이식스 - 한 페이지가 될 수 있게', videoUploader: 'JYP Entertainment', requester: '자동 재생', durationSeconds: 228 },
];

export function DemoMusic() {
  const [currentId, setCurrentId] = useState(1);
  const [queue, setQueue] = useState<number[]>([2, 3, 4]);
  const [status, setStatus] = useState<PlaybackView['status']>('PAUSED');
  const [volume, setVolume] = useState(70);
  const [repeatOne, setRepeatOne] = useState(false);
  const [seekTo, setSeekTo] = useState(0);
  const [queueOpen, setQueueOpen] = useState(true);
  //  곡이 바뀌거나 시크할 때 보간 기준을 다시 잡기 위한 키
  const [epoch, setEpoch] = useState(0);

  const song = LIBRARY.find((s) => s.id === currentId)!;
  const playback: PlaybackView = {
    status,
    youtubeId: null,
    title: song.title,
    videoUploader: song.videoUploader,
    requester: song.requester,
    durationSeconds: song.durationSeconds,
    positionSeconds: seekTo,
  };

  const playSong = useCallback((id: number) => {
    setQueue((q) => [...q.filter((x) => x !== id), currentId].filter((x) => x !== id));
    setCurrentId(id);
    setSeekTo(0);
    setEpoch((e) => e + 1);
    setStatus('PLAYING');
  }, [currentId]);
  const next = useCallback(() => {
    const [head] = queue;
    if (head === undefined) {
      setStatus('STOPPED');
      return;
    }
    playSong(head);
  }, [queue, playSong]);

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

  const controls = {
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
    onSeek: (seconds: number) => {
      setSeekTo(seconds);
      setEpoch((e) => e + 1);
    },
    onVolume: setVolume,
    onRepeat: setRepeatOne,
  };
  const hasSong = status !== 'STOPPED';

  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden bg-muted/40 p-3 md:grid-cols-[minmax(0,1fr)_23.75rem] md:grid-rows-1">
      {/* OBS 방송 화면 모사 — 아래쪽에 브라우저 소스(자막)가 얹힌다 */}
      <div className="flex min-h-0 flex-col gap-1.5 md:order-1">
        <span className="text-[11px] font-semibold text-muted-foreground">OBS 방송 화면 · 브라우저 소스 자막</span>
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-[radial-gradient(circle_at_70%_20%,#312e81_0,#0f172a_55%,#020617_100%)]">
          <div className="absolute top-3 left-3 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">LIVE</div>
          <div className="absolute top-3 right-3 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white">시청자 1,234</div>
          {/* 브라우저 소스: 가로로 길고 낮은 자막 영역 — 실제 SongOverlay */}
          <div className="absolute inset-x-4 bottom-4 h-12 rounded border border-dashed border-white/25 sm:h-14">
            <div className="relative size-full">
              <SongOverlay now={hasSong ? { title: song.title, status: status === 'PLAYING' ? 'PLAYING' : 'PAUSED' } : null} setting={{ mode: 'ALWAYS', durationSeconds: 10 }} />
            </div>
          </div>
        </div>
      </div>

      {/* 데스크톱 앱 미니 플레이어 — 실제 컴포넌트. h-svh 는 프레임 높이로 덮는다 */}
      <div className="flex min-h-0 flex-col gap-1.5 md:order-2">
        <span className="text-[11px] font-semibold text-muted-foreground">위즈봇 플레이어 앱 · 미니 플레이어</span>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border shadow-md [&>div]:h-full!" key={epoch}>
          <MiniPlayer
            playback={hasSong ? playback : { ...playback, title: null, videoUploader: null, requester: null }}
            controls={controls}
            queue={queue.map((id) => LIBRARY.find((s) => s.id === id)!)}
            position={position}
            queueOpen={queueOpen}
            onToggleQueue={() => setQueueOpen((v) => !v)}
            onExpand={() => undefined}
            onPlaySong={(item) => playSong(item.id)}
            platform="darwin"
          />
        </div>
      </div>
    </div>
  );
}
