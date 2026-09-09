'use client';

import { Heart } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * 대표 즐겨찾기 하트 (#264). 이미 담긴 곡이면 채워진 하트로 보여주고 다시 누를 수 없다 —
 * 미니는 토스트가 없어 "이미 담겨 있는 곡입니다" 에러를 볼 수 없으므로 애초에 막는다.
 */
export function FavoriteHeartButton({
  favorite,
  disabled,
}: {
  favorite: { name: string; added: boolean; onAdd: () => void };
  disabled?: boolean;
}) {
  const label = favorite.added
    ? `"${favorite.name}"에 담긴 곡`
    : `즐겨찾기에 담기 (${favorite.name})`;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      aria-pressed={favorite.added}
      disabled={disabled || favorite.added}
      onClick={favorite.onAdd}
      // 채워진 하트는 비활성이어도 흐려지지 않게 — 상태 표시지 잠긴 버튼이 아니다
      className={favorite.added ? 'text-red-500 disabled:opacity-100' : undefined}
    >
      <Heart className={favorite.added ? 'fill-current' : undefined} />
    </Button>
  );
}
