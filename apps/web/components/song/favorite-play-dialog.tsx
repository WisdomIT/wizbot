'use client';

import { useQuery } from '@tanstack/react-query';
import { ListMusic } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 즐겨찾기를 대기열로 바로 불러온다 (#121).
 * 즐겨찾기 페이지로 옮겨가지 않고 플레이어에서 끝내기 위한 것이라,
 * 목록과 「섞어서 추가」만 두고 편집 기능은 넣지 않는다.
 */
export function FavoritePlayDialog({
  onEnqueue,
}: {
  onEnqueue: (favoriteId: number, shuffle: boolean) => void;
}) {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [shuffle, setShuffle] = useState(false);

  const { data, isPending } = useQuery({
    ...trpc.songFavorite.list.queryOptions(),
    enabled: open,
  });

  const favorites = data?.favorites ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="shrink-0">
          <ListMusic /> 즐겨찾기
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>즐겨찾기 재생</DialogTitle>
          <DialogDescription>
            고른 즐겨찾기가 대기열 뒤에 붙습니다. 이미 대기열에 있는 곡은 건너뜁니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="favorite-shuffle" className="text-sm font-normal">
            섞어서 추가
          </Label>
          <Switch id="favorite-shuffle" checked={shuffle} onCheckedChange={setShuffle} />
        </div>

        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : favorites.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            만들어 둔 즐겨찾기가 없습니다.
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {favorites.map((favorite) => (
              <li key={favorite.id}>
                <button
                  type="button"
                  // 곡이 없는 즐겨찾기는 누를 것이 없다
                  disabled={favorite._count.items === 0}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
                  onClick={() => {
                    onEnqueue(favorite.id, shuffle);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{favorite.name}</span>
                  {favorite.isDefault && <Badge variant="secondary">대표</Badge>}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {favorite._count.items}곡
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
