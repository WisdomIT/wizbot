'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';

import { PlayerBar } from '@/components/song/player-bar';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 시청자 화면의 하단 재생 바 — 상태만 보여준다 (#97).
 * 모든 시청자 페이지에 붙으므로 관객 수에 비례해 호출이 늘어난다.
 * 대기열 없이 현재 곡만 받는 가벼운 조회를 쓰고, 주기도 길게 잡는다.
 */
const REFRESH_MS = 30_000;

export function ViewerPlayerBar({ channelId }: { channelId: string }) {
  const pathname = usePathname();
  const trpc = useTRPC();
  // 플레이리스트 페이지는 자체 플레이어가 있으므로 숨긴다
  const onPlaylist = pathname === `/${channelId}/playlist`;

  const { data } = useQuery({
    ...trpc.song.publicNowPlaying.queryOptions({ channelId }),
    enabled: !onPlaylist,
    refetchInterval: onPlaylist ? false : REFRESH_MS,
  });

  const playback = data?.playback;
  if (onPlaylist || !playback?.title) return null;

  return <PlayerBar playback={playback} href={`/${channelId}/playlist`} />;
}
