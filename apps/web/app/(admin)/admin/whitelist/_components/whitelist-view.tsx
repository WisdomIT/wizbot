'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
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

/**
 * 화이트리스트 관리 (#10).
 * 화이트리스트 = 입장권 — 삭제해도 기존 가입 데이터는 유지되고 재로그인만 차단된다.
 */
export function WhitelistView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.admin.listWhitelist.queryOptions());

  const invalidate = () =>
    void queryClient.invalidateQueries(trpc.admin.listWhitelist.queryFilter());

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 py-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        목록을 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          화이트리스트에 등록된 채널만 치지직 로그인이 가능합니다. 삭제해도 기존 가입 데이터는
          유지되며 재로그인만 차단됩니다.
        </p>
        <AddWhitelistDialog onDone={invalidate} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>채널</TableHead>
              <TableHead>채널 ID</TableHead>
              <TableHead>등록</TableHead>
              <TableHead>가입 상태</TableHead>
              <TableHead className="w-24 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  등록된 채널이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarImage src={entry.user?.channelImageUrl ?? undefined} />
                        <AvatarFallback>{entry.nickname.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {entry.user?.channelName ?? entry.nickname}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {entry.channelId}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {entry.approvedAt
                      ? `신청 승인 · ${new Date(entry.approvedAt).toLocaleDateString('ko-KR')}`
                      : '직접 등록'}
                  </TableCell>
                  <TableCell>
                    {entry.user ? <Badge>가입됨</Badge> : <Badge variant="outline">미가입</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <RemoveWhitelistDialog
                      id={entry.id}
                      name={entry.user?.channelName ?? entry.nickname}
                      joined={!!entry.user}
                      onDone={invalidate}
                    />
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

function AddWhitelistDialog({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const addToWhitelist = useMutation(trpc.admin.addToWhitelist.mutationOptions());
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState('');

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    toast.promise(addToWhitelist.mutateAsync({ channelId }), {
      loading: '치지직에서 채널을 확인하는 중입니다...',
      success: (entry) => {
        setOpen(false);
        setChannelId('');
        onDone();
        return `${entry.channelName} 채널이 등록되었습니다.`;
      },
      error: (error) => `등록에 실패했습니다. ${error instanceof Error ? error.message : error}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>채널 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>화이트리스트 추가</DialogTitle>
          <DialogDescription>
            치지직 채널 ID(32자리)를 입력하면 채널명을 자동으로 확인해 등록합니다. 채널 ID는 치지직
            채널 페이지 URL(chzzk.naver.com/뒤의 값)에서 확인할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="channelId" className="text-right">
                채널 ID
              </Label>
              <Input
                id="channelId"
                value={channelId}
                onChange={(event) => setChannelId(event.target.value.trim())}
                placeholder="d9c571e0ecae37fec31711735f95c8f4"
                className="col-span-3 font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={addToWhitelist.isPending || channelId.length === 0}>
              등록
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveWhitelistDialog({
  id,
  name,
  joined,
  onDone,
}: {
  id: number;
  name: string;
  joined: boolean;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const removeFromWhitelist = useMutation(trpc.admin.removeFromWhitelist.mutationOptions());
  const [open, setOpen] = useState(false);

  function handleRemove() {
    toast.promise(removeFromWhitelist.mutateAsync({ id }), {
      loading: '삭제 중...',
      success: () => {
        setOpen(false);
        onDone();
        return `${name} 채널이 화이트리스트에서 삭제되었습니다.`;
      },
      error: (error) => `삭제에 실패했습니다. ${error instanceof Error ? error.message : error}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          삭제
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>화이트리스트에서 삭제할까요?</DialogTitle>
          <DialogDescription>
            {name} 채널이 더 이상 로그인할 수 없게 됩니다.
            {joined
              ? ' 이미 가입된 계정과 데이터(명령어·설정)는 유지되며, 완전 탈퇴는 스트리머 관리에서 처리합니다.'
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleRemove}
            disabled={removeFromWhitelist.isPending}
          >
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
