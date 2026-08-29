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

/**
 * 네이버 카페 연동 설정 (#9 PR1) — 사용 여부(기본 꺼짐), 카페 연결, 봇 가입·권한 확인, 유튜브.
 * 실제 네이버 접속은 워커가 1분 주기로 처리하므로 요청 후 결과가 오기까지 최대 1분 걸린다.
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
  const invalidate = () => void queryClient.invalidateQueries(trpc.cafe.get.queryFilter());

  const setEnabled = useMutation(trpc.cafe.setEnabled.mutationOptions());
  const link = useMutation(trpc.cafe.link.mutationOptions());
  const requestJoin = useMutation(trpc.cafe.requestJoin.mutationOptions());
  const requestVerify = useMutation(trpc.cafe.requestVerify.mutationOptions());
  const setYoutube = useMutation(trpc.cafe.setYoutube.mutationOptions());

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
  const joined = ['JOIN_REQUESTED', 'PERMISSION_OK', 'ACTIVE', 'PERMISSION_FAILED'].includes(data.status);
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
                위즈봇의 네이버 계정{botName ? ` (${botName})` : ''}이 카페 대문을 편집하려면 매니저 권한이 필요합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Step
                n={1}
                done={joined}
                title="봇 가입 신청"
                description="봇 계정이 카페에 가입을 신청합니다. 가입 질문이 필수인 카페는 직접 초대해주세요."
                action={
                  <Button
                    size="sm"
                    variant={joined ? 'outline' : 'default'}
                    disabled={!linked || busy || requestJoin.isPending}
                    onClick={() => run(requestJoin.mutateAsync(), { loading: '요청 중...', success: '가입 신청을 요청했습니다. 1분 안에 처리됩니다.' })}
                  >
                    {joined ? '다시 신청' : '가입 신청'}
                  </Button>
                }
              />
              <Step
                n={2}
                done={permitted}
                title="카페에서 승인 · 매니저 지정"
                description={`카페 관리 → 멤버 관리에서 ${botName ?? '봇 계정'}의 가입을 승인하고, 대문 편집 권한이 있는 매니저로 지정해주세요.`}
              />
              <Step
                n={3}
                done={permitted}
                title="권한 확인"
                description="봇이 대문 편집기를 열 수 있는지 확인합니다. 확인되면 자동화를 시작할 수 있습니다."
                action={
                  <Button
                    size="sm"
                    variant={permitted ? 'outline' : 'default'}
                    disabled={!linked || busy || requestVerify.isPending}
                    onClick={() => run(requestVerify.mutateAsync(), { loading: '요청 중...', success: '권한 확인을 요청했습니다. 1분 안에 처리됩니다.' })}
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
  return <Badge variant={failed ? 'destructive' : ok ? 'default' : 'outline'}>{CAFE_LINK_STATUS_LABEL[status]}</Badge>;
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
