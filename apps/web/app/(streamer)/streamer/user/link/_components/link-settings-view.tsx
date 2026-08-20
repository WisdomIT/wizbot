'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { IconPicker } from '@/components/custom/icon-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

interface Shortcut {
  id: number;
  name: string;
  url: string;
  icon: string;
}

/** 링크 설정 (#7 A2) — 랜딩 카드·/list·시청자 사이드바에 노출되는 바로가기 */
export function LinkSettingsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.shortcut.list.queryOptions());
  const move = useMutation(trpc.shortcut.move.mutationOptions());

  const invalidate = () => void queryClient.invalidateQueries(trpc.shortcut.list.queryFilter());

  function handleMove(id: number, direction: 'up' | 'down') {
    move.mutate({ id, direction }, { onSuccess: invalidate });
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 py-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        링크를 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          여기 등록한 링크는 메인 페이지의 채널 카드, 스트리머 목록, 시청자 페이지 사이드바에
          바로가기로 표시됩니다.
        </p>
        <ShortcutDialog mode="create" onDone={invalidate} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">아이콘</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>주소</TableHead>
              <TableHead className="w-44 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  등록된 링크가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              data.map((shortcut, index) => (
                <TableRow key={shortcut.id}>
                  <TableCell>
                    <DynamicIcon name={shortcut.icon} size={20} />
                  </TableCell>
                  <TableCell className="font-medium">{shortcut.name}</TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {shortcut.url}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="위로"
                      disabled={index === 0 || move.isPending}
                      onClick={() => handleMove(shortcut.id, 'up')}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="아래로"
                      disabled={index === data.length - 1 || move.isPending}
                      onClick={() => handleMove(shortcut.id, 'down')}
                    >
                      <ChevronDown />
                    </Button>
                    <ShortcutDialog mode="edit" shortcut={shortcut} onDone={invalidate} />
                    <DeleteShortcutDialog shortcut={shortcut} onDone={invalidate} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ShortcutDialog({
  mode,
  shortcut,
  onDone,
}: {
  mode: 'create' | 'edit';
  shortcut?: Shortcut;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const create = useMutation(trpc.shortcut.create.mutationOptions());
  const update = useMutation(trpc.shortcut.update.mutationOptions());

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shortcut?.name ?? '');
  const [url, setUrl] = useState(shortcut?.url ?? '');
  const [icon, setIcon] = useState(shortcut?.icon ?? 'Link');

  function reset() {
    setName(shortcut?.name ?? '');
    setUrl(shortcut?.url ?? '');
    setIcon(shortcut?.icon ?? 'Link');
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const promise: Promise<unknown> =
      mode === 'create'
        ? create.mutateAsync({ name, url, icon })
        : update.mutateAsync({ id: shortcut!.id, name, url, icon });

    toast.promise(promise, {
      loading: mode === 'create' ? '링크를 추가하는 중입니다...' : '링크를 수정하는 중입니다...',
      success: () => {
        setOpen(false);
        if (mode === 'create') reset();
        onDone();
        return mode === 'create' ? '링크가 추가되었습니다.' : '링크가 수정되었습니다.';
      },
      error: (err) => `${err instanceof Error ? err.message : err}`,
    });
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button>링크 추가</Button>
        ) : (
          <Button variant="ghost" size="sm">
            수정
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '링크 추가' : '링크 수정'}</DialogTitle>
          <DialogDescription>
            시청자에게 보여줄 바로가기입니다. http(s):// 로 시작하는 주소만 등록할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="shortcut-name" className="text-right">
                이름
              </Label>
              <Input
                id="shortcut-name"
                value={name}
                maxLength={20}
                onChange={(event) => setName(event.target.value)}
                placeholder="카페"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="shortcut-url" className="text-right">
                주소
              </Label>
              <Input
                id="shortcut-url"
                value={url}
                onChange={(event) => setUrl(event.target.value.trim())}
                placeholder="https://cafe.naver.com/example"
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">아이콘</Label>
              <div className="col-span-3">
                <IconPicker value={icon} onChange={setIcon} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || !name || !url}>
              {mode === 'create' ? '추가' : '수정'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteShortcutDialog({ shortcut, onDone }: { shortcut: Shortcut; onDone: () => void }) {
  const trpc = useTRPC();
  const remove = useMutation(trpc.shortcut.delete.mutationOptions());
  const [open, setOpen] = useState(false);

  function handleDelete() {
    toast.promise(remove.mutateAsync({ id: shortcut.id }), {
      loading: '삭제 중...',
      success: () => {
        setOpen(false);
        onDone();
        return `${shortcut.name} 링크가 삭제되었습니다.`;
      },
      error: (err) => `삭제에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          삭제
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>링크를 삭제할까요?</DialogTitle>
          <DialogDescription>
            {shortcut.name} 링크가 시청자에게 더 이상 표시되지 않습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={remove.isPending}>
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
