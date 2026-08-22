'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback } from 'react';

import { PlayerBar } from '@/components/song/player-bar';
import { useSongEvents } from '@/src/hooks/use-song-events';
import { useTRPC } from '@/src/utils/trpc-react';

const PLAYER_PATH = '/streamer/song/player';

/** 스트리머 콘솔의 하단 재생 바 — 뮤직플레이어 페이지에서는 숨긴다 (#97) */
export function StreamerPlayerBar() {
  const pathname = usePathname();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const onPlayer = pathname === PLAYER_PATH;

  const { data } = useQuery({
    ...trpc.song.getState.queryOptions(),
    enabled: !onPlayer,
    refetchInterval: onPlayer ? false : 10_000,
  });

  const invalidate = useCallback(
    () => void queryClient.invalidateQueries(trpc.song.getState.queryFilter()),
    [queryClient, trpc],
  );

  useSongEvents((event) => {
    if (onPlayer) return;
    if (event.type === 'connected' || event.type === 'playback' || event.type === 'queue') {
      invalidate();
    }
  });

  const play = useMutation(trpc.song.play.mutationOptions());
  const pause = useMutation(trpc.song.pause.mutationOptions());
  const next = useMutation(trpc.song.next.mutationOptions());

  const playback = data?.playback;
  if (onPlayer || !playback?.title || playback.status === 'STOPPED') return null;

  const run = (promise: Promise<unknown>) => {
    promise.then(invalidate).catch(() => invalidate());
  };

  return (
    <PlayerBar
      playback={playback}
      href={PLAYER_PATH}
      controls={{
        onPlay: () => run(play.mutateAsync()),
        onPause: () => run(pause.mutateAsync()),
        onNext: () => run(next.mutateAsync()),
      }}
    />
  );
}
