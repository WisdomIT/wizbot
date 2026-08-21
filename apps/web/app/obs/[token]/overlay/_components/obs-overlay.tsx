'use client';

import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@wizbot/shared/src/router';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSongEvents } from '@/src/hooks/use-song-events';

interface NowPlaying {
  title: string;
  videoUploader: string | null;
  requester: string | null;
  status: 'PLAYING' | 'PAUSED' | 'STOPPED';
}

/**
 * 현재 곡 자막. 배경은 투명이라 OBS 브라우저 소스에 그대로 얹으면 된다.
 * ?color=#fff&size=28 로 색상·크기를 조정할 수 있다.
 */
export function ObsOverlay({
  token,
  color = '#ffffff',
  size = '28',
}: {
  token: string;
  color?: string;
  size?: string;
}) {
  const [now, setNow] = useState<NowPlaying | null>(null);

  const trpc = useMemo(
    () =>
      createTRPCClient<AppRouter>({
        links: [httpBatchLink({ url: '/api/trpc', headers: { 'x-song-token': token } })],
      }),
    [token],
  );

  const sync = useCallback(async () => {
    const state = await trpc.song.sourceState.query().catch(() => null);
    const playback = state?.playback;

    if (!playback?.title || playback.status === 'STOPPED') {
      setNow(null);
      return;
    }
    setNow({
      title: playback.title,
      videoUploader: playback.videoUploader,
      requester: playback.requester,
      status: playback.status as NowPlaying['status'],
    });
  }, [trpc]);

  useEffect(() => {
    void sync();
  }, [sync]);

  useSongEvents((event) => {
    if (event.type === 'playback' || event.type === 'command') void sync();
  }, token);

  if (!now) return <div style={{ background: 'transparent' }} />;

  return (
    <div
      style={{
        background: 'transparent',
        color,
        fontSize: `${Number(size) || 28}px`,
        fontWeight: 700,
        // OBS 배경 위에서도 읽히도록 외곽선을 준다
        textShadow: '0 2px 6px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5em',
        padding: '0.2em 0.4em',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{now.status === 'PAUSED' ? '⏸' : '♪'}</span>
      <span>{now.title}</span>
      {now.requester && (
        <span style={{ fontSize: '0.7em', opacity: 0.85 }}>신청: {now.requester}</span>
      )}
    </div>
  );
}
