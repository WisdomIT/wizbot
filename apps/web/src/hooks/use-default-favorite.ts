'use client';

import { useQuery } from '@tanstack/react-query';

import { pickDefaultFavorite } from '@/lib/default-favorite';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 즐겨찾기 목록과 "바로 담기" 대상 (#264).
 * 미니 플레이어·큰 창 하트 버튼이 같이 쓴다 — 규칙은 pickDefaultFavorite 참고.
 */
export function useDefaultFavorite() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.songFavorite.list.queryOptions());
  const favorites = data?.favorites ?? [];
  return { favorites, defaultFavorite: pickDefaultFavorite(favorites) };
}
