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
 * 사용 신청 관리 (#96). 승인하면 화이트리스트 등록까지 한 번에 — 채널 ID 를 옮겨 적을 일이 없다.
 * 대기 중인 신청이 위로 온다.
 */
export function ApplicationsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.admin.listApplications.queryOptions());

  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.admin.listApplications.queryFilter());
    //  승인은 화이트리스트도 바꾼다
    void queryClient.invalidateQueries(trpc.admin.listWhitelist.queryFilter());
  };

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

  const pendingCount = data.filter((a) => a.status === 'PENDING').length;

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          치지직 로그인으로 본인이 확인된 채널만 신청할 수 있습니다. 승인하면 화이트리스트로
          이동합니다.
          {pendingCount > 0 && (
            <>
              {' '}
              <strong className="text-foreground">대기 {pendingCount}건</strong>
            </>
          )}
        </p>
        <SignupSettings />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>채널</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>신청</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-40 text-right">처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  들어온 신청이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              data.map((application) => (
                <TableRow key={application.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarImage src={application.channelImageUrl ?? undefined} />
                        <AvatarFallback>{application.channelName.slice(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">{application.channelName}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {application.channelId}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal break-words text-sm">
                    {application.reason ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(application.createdAt).toLocaleString('ko-KR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusBadge application={application} />
                      {application.status === 'PENDING' && !application.tokenAlive && (
                        <Badge variant="outline" title="연동이 만료돼 승인해도 스트리머가 로그인해야 봇이 붙습니다">
                          재로그인 필요
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <ApproveButton id={application.id} name={application.channelName} onDone={invalidate} />
                      {application.status === 'PENDING' && (
                        <RejectDialog id={application.id} name={application.channelName} onDone={invalidate} />
                      )}
                    </div>
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

function StatusBadge({
  application,
}: {
  application: { status: 'PENDING' | 'APPROVED' | 'REJECTED'; rejectReason: string | null };
}) {
  //  승인된 신청은 목록에 오지 않는다 — 화이트리스트로 이동
  if (application.status === 'REJECTED') {
    return (
      <Badge variant="destructive" title={application.rejectReason ?? undefined}>
        거절
      </Badge>
    );
  }
  return <Badge variant="secondary">대기</Badge>;
}

function SignupSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(trpc.admin.getSignupSettings.queryOptions());
  const setSettings = useMutation(trpc.admin.setSignupSettings.mutationOptions());

  function update(patch: { autoApprove?: boolean; askReason?: boolean }, label: string) {
    toast.promise(setSettings.mutateAsync(patch), {
      loading: '저장 중...',
      success: () => {
        void queryClient.invalidateQueries(trpc.admin.getSignupSettings.queryFilter());
        return label;
      },
      error: (error) => `저장에 실패했습니다. ${error instanceof Error ? error.message : error}`,
    });
  }

  const busy = !settings || setSettings.isPending;

  return (
    <div className="flex items-center gap-5 shrink-0">
      <div className="flex items-center gap-2">
        <Label htmlFor="ask-reason" className="text-sm">
          사유 입력칸
        </Label>
        <Switch
          id="ask-reason"
          checked={settings?.askReason ?? true}
          disabled={busy}
          onCheckedChange={(next) =>
            update({ askReason: next }, next ? '신청 화면에 사유 입력칸을 보입니다.' : '사유 입력칸을 숨겼습니다.')
          }
          aria-label="신청 화면에 사유 입력칸 표시"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="auto-approve" className="text-sm">
          자동 승인
        </Label>
        <Switch
          id="auto-approve"
          checked={settings?.autoApprove ?? false}
          disabled={busy}
          onCheckedChange={(next) =>
            update(
              { autoApprove: next },
              next ? '자동 승인을 켰습니다. 이제 신청 즉시 화이트리스트에 등록됩니다.' : '자동 승인을 껐습니다.',
            )
          }
          aria-label="신청 즉시 자동 승인"
        />
      </div>
    </div>
  );
}

function ApproveButton({ id, name, onDone }: { id: number; name: string; onDone: () => void }) {
  const trpc = useTRPC();
  const approve = useMutation(trpc.admin.approveApplication.mutationOptions());

  function handleApprove() {
    toast.promise(approve.mutateAsync({ id }), {
      loading: '승인 중...',
      success: (result) => {
        onDone();
        return result.botConnects
          ? `${name} 채널을 승인했습니다. 1분 안에 봇이 연결되고 채팅으로 안내합니다.`
          : `${name} 채널을 승인했습니다. 연동이 만료돼 스트리머가 로그인하면 봇이 연결됩니다.`;
      },
      error: (error) => `승인에 실패했습니다. ${error instanceof Error ? error.message : error}`,
    });
  }

  return (
    <Button size="sm" onClick={handleApprove} disabled={approve.isPending}>
      승인
    </Button>
  );
}

function RejectDialog({ id, name, onDone }: { id: number; name: string; onDone: () => void }) {
  const trpc = useTRPC();
  const reject = useMutation(trpc.admin.rejectApplication.mutationOptions());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  function handleReject() {
    toast.promise(reject.mutateAsync({ id, reason: reason || undefined }), {
      loading: '처리 중...',
      success: () => {
        setOpen(false);
        setReason('');
        onDone();
        return `${name} 채널의 신청을 거절했습니다.`;
      },
      error: (error) => `처리에 실패했습니다. ${error instanceof Error ? error.message : error}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          거절
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name} 채널의 신청을 거절할까요?</DialogTitle>
          <DialogDescription>
            사유를 적으면 신청자가 다시 로그인했을 때 볼 수 있습니다. 거절된 채널은 내용을 보완해
            다시 신청할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="reject-reason">거절 사유 (선택)</Label>
          <Input
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, 500))}
            placeholder="예: 방송 채널이 확인되지 않습니다"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleReject} disabled={reject.isPending}>
            거절
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
