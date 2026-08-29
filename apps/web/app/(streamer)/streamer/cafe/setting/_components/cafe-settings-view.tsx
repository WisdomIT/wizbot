'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CAFE_LINK_STATUS_LABEL } from '@wizbot/shared/lib/cafe';
import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/src/utils/trpc-react';

import { GatePicker } from './gate-picker';

/**
 * 네이버 카페 연동 설정 (#9) — 사용 여부(기본 꺼짐), 카페 연결, 봇 가입·권한 확인, 유튜브, 대문에 넣기.
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
  const { data: botName } = useQuery(trpc.cafe.botName.queryOptions());
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
  const setYoutube = useMutation(trpc.cafe.setYoutube.mutationOptions());
  const requestGateFetch = useMutation(trpc.cafe.requestGateFetch.mutationOptions());
  const submitGate = useMutation(trpc.cafe.submitGate.mutationOptions());

  const [url, setUrl] = useState('');
  const [yt, setYt] = useState({ channelId: '', width: 560, height: 315 });
  useEffect(() => {
    if (!data) return;
    setUrl(data.cafeUrl ?? '');
    setYt({ channelId: data.youtubeChannelId ?? '', width: data.youtubeWidth, height: data.youtubeHeight });
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
    <div className="flex max-w-2xl flex-col gap-4 py-4">
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

          <Card>
            <CardHeader>
              <CardTitle>3. 유튜브 (선택)</CardTitle>
              <CardDescription>
                채널 ID 를 넣으면 대문에 업로드 재생목록이 들어갑니다. 새 영상은 자동으로 반영됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="yt">채널 ID</Label>
                  <Input id="yt" value={yt.channelId} onChange={(e) => setYt({ ...yt, channelId: e.target.value.trim() })} placeholder="UC로 시작하는 24자" className="font-mono" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ytw">너비</Label>
                  <Input id="ytw" type="number" className="w-24" value={yt.width} onChange={(e) => setYt({ ...yt, width: Number(e.target.value) })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="yth">높이</Label>
                  <Input id="yth" type="number" className="w-24" value={yt.height} onChange={(e) => setYt({ ...yt, height: Number(e.target.value) })} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  disabled={setYoutube.isPending}
                  onClick={() =>
                    run(setYoutube.mutateAsync({ channelId: yt.channelId || null, width: yt.width, height: yt.height }), {
                      loading: '저장 중...',
                      success: '유튜브 설정을 저장했습니다.',
                    })
                  }
                >
                  저장
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={permitted ? undefined : 'pointer-events-none opacity-50'}>
            <CardHeader>
              <CardTitle>4. 대문에 넣기</CardTitle>
              <CardDescription>
                대문 HTML 을 가져와 방송 상태 이미지{data.youtubeChannelId ? '와 유튜브' : ''}가 들어갈 자리를 고릅니다.
                네이버에 보이는 그대로 렌더한 대문에서 요소를 클릭하면 그 요소가 교체되고, 고르지 않으면 맨 아래에 추가됩니다. 넣은 뒤부터 방송 상태에 따라 자동으로 갱신됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={gate?.gateHtml !== null && gate?.gateHtml !== undefined ? 'outline' : 'default'}
                  disabled={!permitted || busy || requestGateFetch.isPending}
                  onClick={() => run(requestGateFetch.mutateAsync(), { loading: '요청 중...', success: '대문 HTML 을 가져오는 중입니다. 잠시 후 표시됩니다.' })}
                >
                  {gate?.gateHtml !== null && gate?.gateHtml !== undefined ? '대문 HTML 다시 가져오기' : '대문 HTML 가져오기'}
                </Button>
                {gate?.gateFetchedAt && (
                  <span className="text-xs text-muted-foreground">가져온 시각 {new Date(gate.gateFetchedAt).toLocaleString('ko-KR')}</span>
                )}
                {busy && data.pendingAction !== 'VERIFY' && <span className="text-xs text-muted-foreground">워커가 처리 중입니다…</span>}
              </div>
              {gate?.gateHtml !== null && gate?.gateHtml !== undefined && (
                <GatePicker
                  key={gate.gateFetchedAt ? String(gate.gateFetchedAt) : 'none'}
                  html={gate.gateHtml}
                  render={gate.render}
                  imageBlock={gate.imageBlock}
                  youtubeTag={gate.youtubeTag}
                  disabled={busy || submitGate.isPending}
                  onSubmit={(html) => run(submitGate.mutateAsync({ html }), { loading: '요청 중...', success: '대문에 넣는 중입니다. 잠시 후 상태가 「동작 중」으로 바뀝니다.' })}
                />
              )}
              {data.status === 'ACTIVE' && (
                <p className="text-sm text-green-700 dark:text-green-400">대문에 들어가 있습니다 — 방송 상태가 바뀌면 자동으로 갱신됩니다.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
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
