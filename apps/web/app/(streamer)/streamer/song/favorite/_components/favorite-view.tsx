'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GripVertical, ListPlus, Pencil, Plus, Shuffle, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 즐겨찾기 = 미리 담아두는 재생목록 (#5 3단계).
 * 대표로 지정한 즐겨찾기는 대기열이 비었을 때 자동 재생의 출처가 된다.
 */
export function FavoriteView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isPending, error } = useQuery(trpc.songFavorite.list.queryOptions());

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries(trpc.songFavorite.list.queryFilter());
    void queryClient.invalidateQueries(trpc.songFavorite.get.queryFilter());
    void queryClient.invalidateQueries(trpc.song.getState.queryFilter());
  }, [queryClient, trpc]);

  const run = useCallback(
    (promise: Promise<unknown>, success: string | ((result: never) => string)) => {
      toast.promise(promise, {
        loading: '처리 중...',
        success: (result) => {
          invalidate();
          return typeof success === 'string' ? success : success(result as never);
        },
        error: (err) => `${err instanceof Error ? err.message : err}`,
      });
    },
    [invalidate],
  );

  const create = useMutation(trpc.songFavorite.create.mutationOptions());
  const rename = useMutation(trpc.songFavorite.rename.mutationOptions());
  const remove = useMutation(trpc.songFavorite.remove.mutationOptions());
  const setDefault = useMutation(trpc.songFavorite.setDefault.mutationOptions());
  const setAutoPlay = useMutation(trpc.songFavorite.setAutoPlay.mutationOptions());

  // 처음 열었을 때는 대표(목록 첫 번째)를 펼쳐둔다
  const firstId = data?.favorites[0]?.id ?? null;
  useEffect(() => {
    setSelectedId((prev) =>
      prev !== null && data?.favorites.some((favorite) => favorite.id === prev) ? prev : firstId,
    );
  }, [firstId, data?.favorites]);

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">불러오지 못했습니다: {error.message}</div>
    );
  }

  return (
    <div className="flex max-w-5xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>자동 재생</CardTitle>
          <CardDescription>
            대기열이 비면 <strong>대표</strong> 즐겨찾기에서 한 곡을 무작위로 골라 이어서
            재생합니다. 신청자는 「자동 재생」으로 표시됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Switch
            id="auto-play"
            checked={data.autoPlay}
            onCheckedChange={(enabled) =>
              run(
                setAutoPlay.mutateAsync({ enabled }),
                enabled ? '자동 재생을 켰습니다.' : '자동 재생을 껐습니다.',
              )
            }
          />
          <Label htmlFor="auto-play">대기열이 비면 대표 즐겨찾기에서 이어 재생</Label>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <FavoriteListCard
          favorites={data.favorites}
          selectedId={selectedId}
          onSelect={setSelectedId}
          createPending={create.isPending}
          onCreate={(name) => run(create.mutateAsync({ name }), '즐겨찾기를 만들었습니다.')}
          onRename={(id, name) => run(rename.mutateAsync({ id, name }), '이름을 바꿨습니다.')}
          onRemove={(id) => run(remove.mutateAsync({ id }), '즐겨찾기를 삭제했습니다.')}
          onSetDefault={(id) => run(setDefault.mutateAsync({ id }), '대표로 지정했습니다.')}
        />

        <div className="min-w-0 flex-1">
          {selectedId === null ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                왼쪽에서 즐겨찾기를 만들거나 선택하세요.
              </CardContent>
            </Card>
          ) : (
            <FavoriteDetailCard favoriteId={selectedId} run={run} />
          )}
        </div>
      </div>
    </div>
  );
}

interface FavoriteSummary {
  id: number;
  name: string;
  isDefault: boolean;
  _count: { items: number };
}

function FavoriteListCard({
  favorites,
  selectedId,
  onSelect,
  createPending,
  onCreate,
  onRename,
  onRemove,
  onSetDefault,
}: {
  favorites: FavoriteSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  createPending: boolean;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onRemove: (id: number) => void;
  onSetDefault: (id: number) => void;
}) {
  const [name, setName] = useState('');

  return (
    <Card className="md:w-72 md:shrink-0">
      <CardHeader>
        <CardTitle>즐겨찾기</CardTitle>
        <CardDescription>⭐ 표시가 대표입니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onCreate(name.trim());
            setName('');
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="새 즐겨찾기 이름"
            maxLength={50}
          />
          <Button type="submit" size="icon" disabled={createPending || !name.trim()}>
            <Plus />
          </Button>
        </form>

        {favorites.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            아직 즐겨찾기가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {favorites.map((favorite) => (
              <li key={favorite.id}>
                <div
                  className={`flex items-center gap-1 rounded-md px-2 py-1 ${
                    favorite.id === selectedId ? 'bg-muted' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => onSelect(favorite.id)}
                  >
                    <span className="truncate">{favorite.name}</span>
                    {favorite.isDefault && <Badge variant="secondary">대표</Badge>}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {favorite._count.items}곡
                    </span>
                  </button>

                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="대표로 지정"
                    title="대표로 지정"
                    disabled={favorite.isDefault}
                    onClick={() => onSetDefault(favorite.id)}
                  >
                    <Star className={favorite.isDefault ? 'fill-current' : ''} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="이름 바꾸기"
                    title="이름 바꾸기"
                    onClick={() => {
                      const next = window.prompt('새 이름', favorite.name);
                      if (next && next.trim() && next.trim() !== favorite.name) {
                        onRename(favorite.id, next.trim());
                      }
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="삭제"
                    title="삭제"
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm(`"${favorite.name}" 즐겨찾기를 삭제할까요?`)) {
                        onRemove(favorite.id);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface FavoriteItem {
  id: number;
  youtubeId: string;
  title: string;
  videoUploader: string;
  durationSeconds: number;
}

function formatDuration(seconds: number) {
  if (!seconds) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function FavoriteDetailCard({
  favoriteId,
  run,
}: {
  favoriteId: number;
  run: (promise: Promise<unknown>, success: string | ((result: never) => string)) => void;
}) {
  const trpc = useTRPC();
  const { data, isPending } = useQuery(trpc.songFavorite.get.queryOptions({ id: favoriteId }));

  const addItem = useMutation(trpc.songFavorite.addItem.mutationOptions());
  const importPlaylist = useMutation(trpc.songFavorite.importPlaylist.mutationOptions());
  const removeItem = useMutation(trpc.songFavorite.removeItem.mutationOptions());
  const clearItems = useMutation(trpc.songFavorite.clearItems.mutationOptions());
  const reorderItems = useMutation(trpc.songFavorite.reorderItems.mutationOptions());
  const enqueue = useMutation(trpc.songFavorite.enqueue.mutationOptions());

  const [items, setItems] = useState<FavoriteItem[]>([]);
  useEffect(() => setItems(data?.items ?? []), [data?.items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending || !data) {
    return <Skeleton className="h-72 w-full" />;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    run(
      reorderItems.mutateAsync({ id: favoriteId, orderedIds: next.map((item) => item.id) }),
      '순서를 바꿨습니다.',
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {data.name}
          {data.isDefault && <Badge variant="secondary">대표</Badge>}
          <span className="text-sm font-normal text-muted-foreground">{items.length}곡</span>
        </CardTitle>
        <CardDescription>
          검색어·영상 주소로 한 곡씩 담거나, 유튜브 재생목록 주소로 통째로 가져올 수 있습니다.
          순서는 핸들을 잡고 끌어서 바꿉니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={items.length === 0 || enqueue.isPending}
            onClick={() =>
              run(
                enqueue.mutateAsync({ id: favoriteId, shuffle: false }),
                (result: { added: number; skipped: number }) =>
                  `대기열에 ${result.added}곡을 추가했습니다.${
                    result.skipped > 0 ? ` (중복 ${result.skipped}곡 제외)` : ''
                  }`,
              )
            }
          >
            <ListPlus /> 대기열에 추가
          </Button>
          <Button
            variant="outline"
            disabled={items.length === 0 || enqueue.isPending}
            onClick={() =>
              run(
                enqueue.mutateAsync({ id: favoriteId, shuffle: true }),
                (result: { added: number; skipped: number }) =>
                  `섞어서 ${result.added}곡을 추가했습니다.${
                    result.skipped > 0 ? ` (중복 ${result.skipped}곡 제외)` : ''
                  }`,
              )
            }
          >
            <Shuffle /> 셔플해서 추가
          </Button>
          <Button
            variant="ghost"
            className="text-destructive"
            disabled={items.length === 0}
            onClick={() => {
              if (window.confirm(`"${data.name}"의 곡을 모두 비울까요?`)) {
                run(clearItems.mutateAsync({ id: favoriteId }), '모두 비웠습니다.');
              }
            }}
          >
            전체 비우기
          </Button>
        </div>

        <AddItemForm
          pending={addItem.isPending}
          onSubmit={(query) =>
            run(addItem.mutateAsync({ id: favoriteId, query }), '즐겨찾기에 담았습니다.')
          }
        />
        <ImportPlaylistForm
          pending={importPlaylist.isPending}
          onSubmit={(url) =>
            run(
              importPlaylist.mutateAsync({ id: favoriteId, url }),
              (result: { playlistTitle: string; added: number; skipped: number }) =>
                `"${result.playlistTitle}"에서 ${result.added}곡을 가져왔습니다.${
                  result.skipped > 0 ? ` (중복·제외 ${result.skipped}곡)` : ''
                }`,
            )
          }
        />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">#</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-20 text-right">길이</TableHead>
                <TableHead className="w-14 text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-muted-foreground">
                    담긴 곡이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                <SortableContext
                  items={items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((item, index) => (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      onRemove={() =>
                        run(
                          removeItem.mutateAsync({ id: favoriteId, itemId: item.id }),
                          '즐겨찾기에서 뺐습니다.',
                        )
                      }
                    />
                  ))}
                </SortableContext>
              )}
            </TableBody>
          </Table>
        </DndContext>
      </CardContent>
    </Card>
  );
}

function SortableItemRow({
  item,
  index,
  onRemove,
}: {
  item: FavoriteItem;
  index: number;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <TableRow
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: isDragging ? 'relative' : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={isDragging ? 'bg-muted' : undefined}
    >
      <TableCell>
        <div className="flex items-center gap-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`${item.title} 순서 변경`}
            className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <span className="tabular-nums">{index + 1}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{item.title}</span>
          <span className="text-xs text-muted-foreground">{item.videoUploader}</span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatDuration(item.durationSeconds)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          aria-label="빼기"
          className="text-destructive"
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AddItemForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (query: string) => void;
}) {
  const [query, setQuery] = useState('');

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!query.trim()) return;
        onSubmit(query.trim());
        setQuery('');
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="검색어 또는 유튜브 영상 주소"
      />
      <Button type="submit" disabled={pending || !query.trim()}>
        담기
      </Button>
    </form>
  );
}

function ImportPlaylistForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState('');

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!url.trim()) return;
        onSubmit(url.trim());
        setUrl('');
      }}
    >
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="유튜브 재생목록 주소 (…/playlist?list=…)"
      />
      <Button type="submit" variant="outline" disabled={pending || !url.trim()}>
        가져오기
      </Button>
    </form>
  );
}
