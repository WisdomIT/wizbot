'use client';

import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

import { submitApplication } from '../actions';
import { ChzzkLoginButton } from './chzzk-login-button';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Application {
  channelName: string;
  channelImageUrl: string | null;
  reason: string | null;
  status: Status;
  rejectReason: string | null;
  /** APPROVED 인데 false 면 승인 뒤 화이트리스트에서 해제된 채널 */
  whitelisted: boolean;
}

export function ApplyForm({ application: initial }: { application: Application }) {
  const [application, setApplication] = useState(initial);
  const [reason, setReason] = useState(initial.reason ?? '');
  const [pending, startTransition] = useTransition();

  //  승인됐는데 화이트리스트에 없다 = 해제됨. 거절과 같이 재신청할 수 있는 상태로 다룬다
  const revoked = application.status === 'APPROVED' && !application.whitelisted;
  const canReapply = application.status === 'REJECTED' || revoked;
  const isPending = application.status === 'PENDING';

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        const { status } = await submitApplication(reason);
        setApplication((prev) => ({ ...prev, status, reason, rejectReason: null }));
        toast.success(canReapply ? '다시 신청했습니다.' : '신청 사유를 저장했습니다.');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '저장에 실패했습니다.');
      }
    });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">위즈봇 사용 신청</CardTitle>
        <CardDescription className="flex items-center justify-center gap-2 pt-1">
          <Avatar className="size-6">
            <AvatarImage src={application.channelImageUrl ?? undefined} />
            <AvatarFallback>{application.channelName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <span className="font-medium text-foreground">{application.channelName}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <StatusBanner application={application} revoked={revoked} />

        {application.status === 'APPROVED' && !revoked ? (
          <ChzzkLoginButton>로그인하러 가기</ChzzkLoginButton>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="reason">
                신청 사유 <span className="text-muted-foreground font-normal">(선택)</span>
              </Label>
              <textarea
                id="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value.slice(0, 500))}
                rows={4}
                placeholder="어떤 방송에서 어떻게 쓰실 예정인지 적어주시면 검토에 도움이 됩니다"
                className="border-input bg-transparent placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
              />
              <p className="text-xs text-muted-foreground text-right">{reason.length}/500</p>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {canReapply ? '다시 신청하기' : isPending ? '사유 저장' : '신청하기'}
            </Button>
          </form>
        )}

        <p className="text-xs text-muted-foreground text-center">
          처리 결과는 따로 알려드릴 수단이 없습니다. 다시 로그인하면 이 화면에서 확인할 수 있습니다.
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBanner({ application, revoked }: { application: Application; revoked: boolean }) {
  if (revoked) {
    return (
      <Banner icon={<XCircle className="text-destructive" />} title="사용이 해제되었습니다">
        관리자가 화이트리스트에서 채널을 해제했습니다. 다시 신청할 수 있습니다.
      </Banner>
    );
  }
  switch (application.status) {
    case 'PENDING':
      return (
        <Banner icon={<Clock className="text-amber-500" />} title="검토 대기 중">
          관리자가 확인하면 승인됩니다. 승인 후 같은 치지직 계정으로 로그인하면 바로 쓸 수 있습니다.
        </Banner>
      );
    case 'APPROVED':
      return (
        <Banner icon={<CheckCircle2 className="text-green-600" />} title="승인되었습니다">
          치지직으로 다시 로그인하면 스트리머 콘솔로 들어갑니다.
        </Banner>
      );
    case 'REJECTED':
      return (
        <Banner icon={<XCircle className="text-destructive" />} title="거절되었습니다">
          {application.rejectReason ? `사유: ${application.rejectReason}` : '사유가 적혀 있지 않습니다.'}{' '}
          내용을 보완해 다시 신청할 수 있습니다.
        </Banner>
      );
  }
}

function Banner({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border p-3 text-sm">
      <div className="mt-0.5 shrink-0 [&>svg]:size-5">{icon}</div>
      <div className="flex flex-col gap-1">
        <strong>{title}</strong>
        <p className="text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}
