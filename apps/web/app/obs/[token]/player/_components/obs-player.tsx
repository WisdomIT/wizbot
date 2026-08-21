'use client';

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/src/router';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useSongEvents } from '@/src/hooks/use-song-events';

/**
 * YouTube IFrame Player 로 오디오만 재생한다 (#5 2단계).
 *
 * - 지정된 송출 소스가 OBS 이고, 이 창이 활성 세션일 때만 재생한다
 *   (브라우저 소스를 실수로 두 개 열어도 이중 재생되지 않게)
 * - 곡이 끝나면 reportEnded → 서버가 큐에서 다음 곡을 올리고 SSE 로 알린다
 * - 재생 불가 영상은 reportFailed 로 보고해 자동으로 넘어간다
 */

interface PlaybackState {
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
  youtubeId: string | null;
  volume: number;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

function loadYouTubeApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT);

  return new Promise((resolve) => {
    const existing = document.getElementById('youtube-iframe-api');
    if (!existing) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
  });
}

export function ObsPlayer({ token }: { token: string }) {
  const [message, setMessage] = useState('연결 중...');
  const playerRef = useRef<any>(null);
  const currentVideoRef = useRef<string | null>(null);
  // 창마다 고유 — 마지막에 연 창만 활성 세션이 된다
  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const isActiveRef = useRef(false);

  const trpc = useMemo(
    () =>
      createTRPCClient<AppRouter>({
        links: [httpBatchLink({ url: '/api/trpc', headers: { 'x-song-token': token } })],
      }),
    [token],
  );

  /** 서버 상태를 읽어 플레이어를 맞춘다 */
  const sync = useMemo(
    () => async () => {
      const state = await trpc.song.sourceState.query().catch(() => null);
      if (!state) {
        setMessage('토큰이 유효하지 않습니다.');
        return;
      }

      const player = playerRef.current;
      if (!player) return;

      if (state.sourceType !== 'OBS') {
        player.stopVideo?.();
        setMessage(
          `송출 소스가 ${state.sourceType === 'NONE' ? '없음' : '앱'} 으로 설정되어 있습니다.`,
        );
        return;
      }
      if (!isActiveRef.current) {
        player.stopVideo?.();
        setMessage('다른 창이 재생 중입니다. (이 창은 대기)');
        return;
      }

      const playback = state.playback as unknown as PlaybackState;
      player.setVolume?.(playback.volume);

      if (!playback.youtubeId || playback.status === 'STOPPED') {
        player.stopVideo?.();
        currentVideoRef.current = null;
        setMessage('재생 중인 곡이 없습니다.');
        return;
      }

      if (currentVideoRef.current !== playback.youtubeId) {
        currentVideoRef.current = playback.youtubeId;
        player.loadVideoById?.(playback.youtubeId);
      }

      if (playback.status === 'PLAYING') player.playVideo?.();
      else player.pauseVideo?.();

      setMessage(`재생 중: ${playback.youtubeId}`);
    },
    [trpc],
  );

  // 플레이어 초기화
  useEffect(() => {
    let disposed = false;

    void (async () => {
      const YT = await loadYouTubeApi();
      if (disposed) return;

      playerRef.current = new YT.Player('obs-player', {
        height: '1',
        width: '1',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: () => void sync(),
          onStateChange: (event: any) => {
            // 0 = ENDED
            if (event.data === 0 && isActiveRef.current) {
              void trpc.song.reportEnded.mutate();
            }
          },
          onError: () => {
            if (isActiveRef.current) void trpc.song.reportFailed.mutate();
          },
        },
      });
    })();

    return () => {
      disposed = true;
      playerRef.current?.destroy?.();
    };
  }, [sync, trpc]);

  // 하트비트 — 활성 세션 여부를 갱신한다
  useEffect(() => {
    const beat = async () => {
      const result = await trpc.song.heartbeat
        .mutate({ sessionId, source: 'OBS' })
        .catch(() => null);
      if (result) {
        const wasActive = isActiveRef.current;
        isActiveRef.current = result.active;
        if (wasActive !== result.active) void sync();
      }
    };
    void beat();
    const timer = setInterval(() => void beat(), 10_000);
    return () => clearInterval(timer);
  }, [trpc, sessionId, sync]);

  // 진행률 보고
  useEffect(() => {
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!isActiveRef.current || !player?.getCurrentTime) return;
      const position = player.getCurrentTime();
      if (typeof position === 'number' && position > 0) {
        void trpc.song.reportPosition.mutate({ positionSeconds: position }).catch(() => null);
      }
    }, 5_000);
    return () => clearInterval(timer);
  }, [trpc]);

  // 서버 이벤트에 반응
  useSongEvents((event) => {
    if (event.type === 'playback' || event.type === 'command' || event.type === 'source') {
      void sync();
    }
  }, token);

  return (
    <div style={{ background: 'transparent', color: '#fff', fontSize: 12, opacity: 0.6 }}>
      {/* 영상은 보이지 않게 두고 소리만 내보낸다 */}
      <div id="obs-player" style={{ position: 'fixed', top: -9999, left: -9999 }} />
      <span>{message}</span>
    </div>
  );
}
