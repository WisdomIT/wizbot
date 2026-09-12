'use client';

import { Heart } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

/** 하트 위 작은 배지 (#276) — 자주 들은 곡. 한 번 마우스를 올리면 사라지고 onSeen 으로 숨김을 기록한다. 강조하지 않는다 */
export interface FavoriteHint {
  text: string;
  onSeen: () => void;
}

export function FavoriteHintBadge({ hint, children }: { hint?: FavoriteHint | null; children: React.ReactNode }) {
  const [seen, setSeen] = useState(false);
  if (!hint || seen) return <>{children}</>;
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        setSeen(true);
        hint.onSeen();
      }}
    >
      {children}
      <span className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-primary px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap text-primary-foreground shadow">
        {hint.text}
      </span>
    </span>
  );
}

/**
 * 대표 즐겨찾기 하트 (#264). 이미 담긴 곡이면 채워진 하트로 보여주고 다시 누를 수 없다 —
 * 미니는 토스트가 없어 "이미 담겨 있는 곡입니다" 에러를 볼 수 없으므로 애초에 막는다.
 */
export function FavoriteHeartButton({
  favorite,
  disabled,
}: {
  favorite: { name: string; added: boolean; onAdd: () => void; hint?: FavoriteHint | null };
  disabled?: boolean;
}) {
  const label = favorite.added
    ? `"${favorite.name}"에 담긴 곡`
    : `즐겨찾기에 담기 (${favorite.name})`;
  return (
    <FavoriteHintBadge hint={favorite.added ? null : favorite.hint}>
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
    </FavoriteHintBadge>
  );
}
