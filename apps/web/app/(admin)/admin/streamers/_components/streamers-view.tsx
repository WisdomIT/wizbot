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

/** 스트리머 관리 (#10 PR B) — 공개 노출(hidden) 토글, 탈퇴 처리 */
export function StreamersView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.admin.listStreamers.queryOptions());
  const setHidden = useMutation(trpc.admin.setStreamerHidden.mutationOptions());

  const invalidate = () =>
    void queryClient.invalidateQueries(trpc.admin.listStreamers.queryFilter());

  function handleToggleHidden(userId: number, name: string, next: boolean) {
    toast.promise(setHidden.mutateAsync({ userId, hidden: next }), {
      loading: '변경 중...',
      success: () => {
        invalidate();
        return `${name} 채널이 ${next ? '숨김' : '공개'} 처리되었습니다.`;
      },
      error: (err) => `변경에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

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
      <p className="text-sm text-muted-foreground">
        가입(로그인)한 스트리머 목록입니다. 숨김 처리하면 메인/스트리머 목록에 노출되지 않습니다.
        탈퇴 처리는 명령어·설정·연동 토큰을 모두 삭제하며, 화이트리스트는 별도로 관리됩니다.
      </p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>채널</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>명령어</TableHead>
              <TableHead>반복</TableHead>
              <TableHead className="w-40 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  가입한 스트리머가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              data.map((streamer) => (
                <TableRow key={streamer.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarImage src={streamer.channelImageUrl ?? undefined} />
                        <AvatarFallback>{streamer.channelName.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{streamer.channelName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {streamer.channelId}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {streamer.hidden ? (
                        <Badge variant="secondary">숨김</Badge>
                      ) : (
                        <Badge>공개</Badge>
                      )}
                      {!streamer.whitelisted && <Badge variant="destructive">입장권 없음</Badge>}
                      {!streamer.oauthExpiresAt && <Badge variant="outline">연동 없음</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{streamer.commandCount}</TableCell>
                  <TableCell>{streamer.repeatCount}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        handleToggleHidden(streamer.id, streamer.channelName, !streamer.hidden)
                      }
                    >
                      {streamer.hidden ? '공개' : '숨김'}
                    </Button>
                    <DeleteStreamerDialog
                      userId={streamer.id}
                      name={streamer.channelName}
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

function DeleteStreamerDialog({
  userId,
  name,
  onDone,
}: {
  userId: number;
  name: string;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const deleteStreamer = useMutation(trpc.admin.deleteStreamer.mutationOptions());
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  function handleDelete() {
    toast.promise(deleteStreamer.mutateAsync({ userId }), {
      loading: '탈퇴 처리 중...',
      success: () => {
        setOpen(false);
        setConfirmText('');
        onDone();
        return `${name} 채널이 탈퇴 처리되었습니다.`;
      },
      error: (err) => `탈퇴 처리에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          탈퇴
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정말 탈퇴 처리할까요?</DialogTitle>
          <DialogDescription>
            {name} 채널의 명령어·반복 메시지·설정·치지직 연동이 모두 삭제되며 복구할 수 없습니다.
            챗봇 연결은 1분 내에 해제됩니다. 계속하려면 채널명을 입력하세요.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder={name}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmText !== name || deleteStreamer.isPending}
          >
            탈퇴 처리
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
