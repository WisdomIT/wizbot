'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

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
 * 관리자 계정 관리 (#10 PR B).
 * 매직 링크 방식이라 이메일 = 계정 — 추가 즉시 그 메일함 소유자가 관리자 권한을 갖는다.
 */
export function AdminsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const admins = useQuery(trpc.admin.listAdmins.queryOptions());
  const me = useQuery(trpc.admin.me.queryOptions());

  const invalidate = () => void queryClient.invalidateQueries(trpc.admin.listAdmins.queryFilter());

  if (admins.isPending || me.isPending) {
    return (
      <div className="flex flex-col gap-2 py-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (admins.error || me.error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        목록을 불러오지 못했습니다: {(admins.error ?? me.error)?.message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          이메일 매직 링크로 로그인하는 관리자 계정입니다. 추가 즉시 해당 메일함 소유자가 관리자
          권한을 갖게 되므로 주소를 정확히 확인하세요.
        </p>
        <AddAdminDialog onDone={invalidate} />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이메일</TableHead>
              <TableHead className="w-24 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.data.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell>
                  <span className="font-medium">{admin.email}</span>{' '}
                  {admin.id === me.data.id && <Badge variant="outline">나</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <RemoveAdminDialog
                    id={admin.id}
                    email={admin.email}
                    disabled={admin.id === me.data.id || admins.data.length <= 1}
                    onDone={invalidate}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AddAdminDialog({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC();
  const addAdmin = useMutation(trpc.admin.addAdmin.mutationOptions());
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  const match = email.length > 0 && email === confirmEmail;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!match) return;

    toast.promise(addAdmin.mutateAsync({ email }), {
      loading: '추가 중...',
      success: (admin) => {
        setOpen(false);
        setEmail('');
        setConfirmEmail('');
        onDone();
        return `${admin.email} 관리자가 추가되었습니다.`;
      },
      error: (err) => `추가에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>관리자 추가</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>관리자 추가</DialogTitle>
          <DialogDescription>
            비밀번호가 없는 매직 링크 방식입니다 — 오타가 곧 권한 오발급이므로 이메일을 두 번 입력해
            확인합니다.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value.trim())}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="confirmEmail" className="text-right">
                이메일 확인
              </Label>
              <Input
                id="confirmEmail"
                type="email"
                value={confirmEmail}
                onChange={(event) => setConfirmEmail(event.target.value.trim())}
                className="col-span-3"
              />
            </div>
            {confirmEmail.length > 0 && !match && (
              <p className="text-right text-xs text-destructive">이메일이 일치하지 않습니다.</p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!match || addAdmin.isPending}>
              추가
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveAdminDialog({
  id,
  email,
  disabled,
  onDone,
}: {
  id: number;
  email: string;
  disabled: boolean;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const removeAdmin = useMutation(trpc.admin.removeAdmin.mutationOptions());
  const [open, setOpen] = useState(false);

  function handleRemove() {
    toast.promise(removeAdmin.mutateAsync({ id }), {
      loading: '삭제 중...',
      success: () => {
        setOpen(false);
        onDone();
        return `${email} 관리자가 삭제되었습니다.`;
      },
      error: (err) => `삭제에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}>
          삭제
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>관리자를 삭제할까요?</DialogTitle>
          <DialogDescription>{email} 계정이 더 이상 로그인할 수 없게 됩니다.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button variant="destructive" onClick={handleRemove} disabled={removeAdmin.isPending}>
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
