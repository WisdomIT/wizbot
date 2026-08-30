'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CAFE_LINK_STATUS_LABEL } from '@wizbot/shared/lib/cafe';
import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/src/utils/trpc-react';

import { GatePicker } from './gate-picker';

/**
 * 네이버 카페 연동 설정 (#9) — 사용 여부(기본 꺼짐), 카페 연결, 봇 가입·권한 확인, 대문 자리 고르기.
 * 대문 이미지와 유튜브 채널은 각자 메뉴에서 설정한다 — 여기서는 대문의 어느 요소가 무엇이 될지만 고른다.
 * 권한 확인은 워커가 15초 주기로 처리한다. 가입은 운영자가 직접 한다 — 카페 가입 폼에 보안문자가 있다.
 */
export function CafeSettingsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery({
    ...trpc.cafe.get.queryOptions(),
    // 워커 처리 중이면 결과를 기다린다
    refetchInterval: (query) => (query.state.data?.pendingAction ? 5000 : false),
  });
  const { data: bot } = useQuery(trpc.cafe.botStatus.queryOptions());
  const botName = bot?.displayName ?? null;
  const sessionExpired = bot?.valid === false;
  const { data: gate } = useQuery({
    ...trpc.cafe.gate.queryOptions(),
    refetchInterval: (query) => (data?.pendingAction ? 5000 : false),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.cafe.get.queryFilter());
    void queryClient.invalidateQueries(trpc.cafe.gate.queryFilter());
  };

  const setEnabled = useMutation(trpc.cafe.setEnabled.mutationOptions());
  const link = useMutation(trpc.cafe.link.mutationOptions());
  const requestJoin = useMutation(trpc.cafe.requestJoin.mutationOptions());
  const requestVerify = useMutation(trpc.cafe.requestVerify.mutationOptions());
  const requestGateFetch = useMutation(trpc.cafe.requestGateFetch.mutationOptions());
  const savePicks = useMutation(trpc.cafe.savePicks.mutationOptions());

  const [url, setUrl] = useState('');
  useEffect(() => {
    if (data) setUrl(data.cafeUrl ?? '');
  }, [data]);

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error) return <div className="py-8 text-sm text-muted-foreground">설정을 불러오지 못했습니다: {error.message}</div>;

  const run = <T,>(promise: Promise<T>, messages: { loading: string; success: string | ((r: T) => string) }) =>
    toast.promise(promise, {
      loading: messages.loading,
      success: (r) => {
        invalidate();
        return typeof messages.success === 'function' ? messages.success(r) : messages.success;
      },
      error: (err) => (err instanceof Error ? err.message : String(err)),
    });

  const linked = !!data.clubId;
  const busy = !!data.pendingAction;
  const requested = data.status !== 'NONE';
  const joined = ['JOINED', 'PERMISSION_OK', 'ACTIVE', 'PERMISSION_FAILED'].includes(data.status);
  const permitted = data.status === 'PERMISSION_OK' || data.status === 'ACTIVE';

  return (
    <div className="flex max-w-[1344px] flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>네이버 카페 연동</CardTitle>
              <CardDescription>
                방송 상태를 카페 대문에 자동으로 표시합니다. 선택 기능이며 기본은 꺼져 있습니다.
              </CardDescription>
            </div>
            <Switch
              checked={data.enabled}
              disabled={setEnabled.isPending}
              onCheckedChange={(next) =>
                run(setEnabled.mutateAsync({ enabled: next }), {
                  loading: '변경 중...',
                  success: next ? '카페 연동을 켰습니다.' : '카페 연동을 껐습니다.',
                })
              }
              aria-label="카페 연동 사용"
            />
          </div>
        </CardHeader>
      </Card>

      {sessionExpired && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <strong>봇 계정의 네이버 세션이 만료되어 대문 갱신이 중단되었습니다.</strong> 운영자에게 알림이 전송되었으며, 운영자가 세션을 갱신하면 밀린 작업부터 자동으로 재개됩니다.
          {bot?.checkedAt && <span className="ml-1 text-muted-foreground">(확인 {new Date(bot.checkedAt).toLocaleString('ko-KR')})</span>}
        </div>
      )}

      <div className={data.enabled ? undefined : 'pointer-events-none opacity-50'}>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>1. 카페 연결</CardTitle>
              <CardDescription>카페 주소를 입력하면 카페 정보를 확인합니다.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-2">
                <Input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://cafe.naver.com/카페주소"
                />
                <Button
                  onClick={() =>
                    run(link.mutateAsync({ url }), {
                      loading: '카페를 확인하는 중...',
                      success: (r) => `${r.cafeName ?? r.clubId} 카페를 연결했습니다.`,
                    })
                  }
                  disabled={link.isPending || !url.trim()}
                >
                  연결
                </Button>
              </div>
              {linked && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{data.cafeName ?? '(이름 없음)'}</span>
                  <span className="ml-2 font-mono text-xs">clubid {data.clubId}</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>2. 봇 계정 권한</CardTitle>
                <StatusBadge status={data.status} busy={busy} />
              </div>
              <CardDescription>
                위즈봇의 네이버 계정{botName ? ` (${botName})` : ''}이 카페 대문을 편집하려면 카페의{' '}
                <strong>디자인 스탭</strong>(또는 매니저) 권한이 필요합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Step
                n={1}
                done={joined}
                title="봇 가입 신청"
                description={
                  data.status === 'JOIN_REQUESTED'
                    ? '운영자에게 요청했습니다. 운영자가 봇 계정으로 카페에 가입 신청하면 다음 단계로 넘어갑니다 (보통 하루 안).'
                    : '요청하면 운영자가 봇 계정으로 카페에 가입을 신청합니다. 카페 가입에 보안문자가 있어 자동으로 할 수 없습니다.'
                }
                action={
                  <Button
                    size="sm"
                    variant={requested ? 'outline' : 'default'}
                    disabled={!linked || busy || requestJoin.isPending || data.status === 'JOIN_REQUESTED'}
                    onClick={() => run(requestJoin.mutateAsync(), { loading: '요청 중...', success: '운영자에게 가입을 요청했습니다.' })}
                  >
                    {data.status === 'JOIN_REQUESTED' ? '요청됨' : requested ? '다시 요청' : '가입 신청'}
                  </Button>
                }
              />
              <Step
                n={2}
                done={permitted}
                title="카페에서 승인 · 디자인 스탭 지정"
                description={`카페 관리 → 멤버 관리에서 ${botName ?? '봇 계정'}의 가입을 승인한 뒤, 스탭 관리에서 디자인 스탭(또는 매니저)으로 지정해주세요. 대문 편집에는 디자인 스탭 권한이면 충분합니다.`}
              />
              <Step
                n={3}
                done={permitted}
                title="권한 확인"
                description="봇이 대문 편집기를 열 수 있는지 확인합니다. 15초 안에 결과가 나오고, 확인되면 자동화를 시작할 수 있습니다."
                action={
                  <Button
                    size="sm"
                    variant={permitted ? 'outline' : 'default'}
                    disabled={!linked || busy || requestVerify.isPending}
                    onClick={() => run(requestVerify.mutateAsync(), { loading: '요청 중...', success: '권한 확인을 요청했습니다. 잠시 후 결과가 표시됩니다.' })}
                  >
                    {permitted ? '다시 확인' : '권한 확인'}
                  </Button>
                }
              />
              {data.statusMessage && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">{data.statusMessage}</p>
              )}
            </CardContent>
          </Card>

          <Card className={permitted ? undefined : 'pointer-events-none opacity-50'}>
            <CardHeader>
              <CardTitle>3. 방송 상태 위치 설정</CardTitle>
              <CardDescription>
                네이버와 동일하게 렌더된 대문에서 <strong>방송 상태 이미지</strong>와 <strong>유튜브 영상</strong>이 들어갈 요소를 클릭해 지정합니다.
                지정한 요소는 해당 블록으로 교체되며 크기는 그 요소를 따릅니다. 두 항목 모두 선택 사항이며, 지정하지 않으면 반영하지 않습니다.
                이미지는 <Link href="/streamer/cafe/editor" className="underline">대문 이미지</Link>, 영상은 <Link href="/streamer/cafe/youtube" className="underline">유튜브 채널</Link> 설정이 완료되어야 반영됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={gate?.gateHtml != null ? 'outline' : 'default'}
                  disabled={!permitted || busy || requestGateFetch.isPending}
                  onClick={() => run(requestGateFetch.mutateAsync(), { loading: '요청 중...', success: '대문을 불러오는 중입니다. 잠시 후 표시됩니다.' })}
                >
                  {gate?.gateHtml != null ? '대문 다시 불러오기' : '대문 불러오기'}
                </Button>
                {gate?.gateFetchedAt && (
                  <span className="text-xs text-muted-foreground">불러온 시각 {new Date(gate.gateFetchedAt).toLocaleString('ko-KR')}</span>
                )}
                {busy && data.pendingAction !== 'VERIFY' && <span className="text-xs text-muted-foreground">워커가 처리 중입니다…</span>}
              </div>
              {gate?.gateHtml != null && (
                <GatePicker
                  key={`${gate.gateFetchedAt ? String(gate.gateFetchedAt) : 'none'}-${JSON.stringify(gate.picks)}`}
                  html={gate.gateHtml}
                  render={gate.render}
                  initial={gate.picks}
                  present={gate.present}
                  ready={gate.ready}
                  disabled={busy || savePicks.isPending}
                  onApply={(picks) => run(savePicks.mutateAsync(picks), { loading: '저장 중...', success: (r) => (r.applying ? '위치를 저장하고 대문에 반영하는 중입니다.' : '위치를 저장했습니다. 설정이 완료되면 반영됩니다.') })}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>4. 반영 현황</CardTitle>
              <CardDescription>대문이 마지막으로 변경된 시각과 현재 대문에 반영된 방송 상태입니다. 방송 상태는 30초마다 확인하며, 변화가 있을 때 대문을 갱신합니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityPanel activity={gate?.activity ?? null} active={data.status === 'ACTIVE'} sessionExpired={sessionExpired} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

type Activity = {
  gateUpdatedAt: string | Date | null; lastSavedAt: string | Date | null; serial: number; gateSerial: number;
  snapshot: { live: boolean; title: string; category: string; viewers: number; openedAt: string | null } | null; imageUrl: string | null;
};

function ActivityPanel({ activity, active, sessionExpired }: { activity: Activity | null; active: boolean; sessionExpired: boolean }) {
  if (!activity) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;
  const fmt = (d: string | Date | null) => (d ? new Date(d).toLocaleString('ko-KR') : '없음');
  const s = activity.snapshot;
  const pending = activity.gateSerial < activity.serial;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_auto]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">동작 상태</dt>
        <dd>{sessionExpired ? <span className="text-destructive">중단 — 봇 계정 세션 만료 (운영자 갱신 대기)</span> : active ? '동작 중 — 방송 상태에 따라 자동 갱신' : '중지 — 위치를 지정하고 반영하면 시작됩니다'}</dd>
        <dt className="text-muted-foreground">마지막 대문 변경</dt>
        <dd>{fmt(activity.gateUpdatedAt)}{activity.gateSerial > 0 && <span className="ml-2 font-mono text-xs text-muted-foreground">v{activity.gateSerial}</span>}</dd>
        <dt className="text-muted-foreground">반영된 방송 상태</dt>
        <dd>
          {s ? (
            s.live
              ? `방송 중 · ${s.title || '(제목 없음)'} · ${s.category || '(카테고리 없음)'} · ${s.viewers.toLocaleString('ko-KR')}명${s.openedAt ? ` · ${new Date(s.openedAt).toLocaleString('ko-KR')} 시작` : ''}`
              : '방송 종료'
          ) : '아직 반영된 상태가 없습니다'}
          {s && <span className="ml-2 text-xs text-muted-foreground">({fmt(activity.lastSavedAt)} 판정)</span>}
          {pending && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">v{activity.serial} 반영 대기 중</span>}
        </dd>
      </dl>
      {activity.imageUrl && (
        <figure className="flex flex-col gap-1">
          <img src={activity.imageUrl} alt="현재 대문 이미지" className="max-h-40 w-auto max-w-[320px] rounded border" />
          <figcaption className="text-xs text-muted-foreground">현재 대문 이미지</figcaption>
        </figure>
      )}
    </div>
  );
}

function StatusBadge({ status, busy }: { status: keyof typeof CAFE_LINK_STATUS_LABEL; busy: boolean }) {
  if (busy) {
    return (
      <Badge variant="secondary">
        <Clock className="size-3" /> 처리 중
      </Badge>
    );
  }
  const failed = status.endsWith('FAILED');
  const ok = status === 'PERMISSION_OK' || status === 'ACTIVE';
  return <Badge variant={failed ? 'destructive' : ok ? 'default' : status === 'NONE' ? 'outline' : 'secondary'}>{CAFE_LINK_STATUS_LABEL[status]}</Badge>;
}

function Step({ n, done, title, description, action }: { n: number; done: boolean; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">
        {done ? <CheckCircle2 className="size-5 text-green-600" /> : <Circle className="size-5 text-muted-foreground" />}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">
          {n}. {title}
        </span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      {action}
    </div>
  );
}
// XCircle 은 실패 배지에서 쓰지 않아도 import 정리를 위해 남긴다
void XCircle;
