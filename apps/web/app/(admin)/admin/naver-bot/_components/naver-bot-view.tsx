'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 네이버 봇 계정 세션 (#9). 쿠키를 DB 에 두는 이유: 세션이 만료됐다고 재배포할 수는 없다.
 * 워커가 30분마다 유효성을 검사해 결과를 여기에 보인다.
 */
export function NaverBotView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    ...trpc.cafe.getBotSession.queryOptions(),
    // 저장 직후에는 워커의 검사 결과(15초 안)를 기다린다
    refetchInterval: (query) => (query.state.data && query.state.data.valid === null ? 3000 : false),
  });
  const save = useMutation(trpc.cafe.setBotSession.mutationOptions());
  const { data: joinRequests } = useQuery({ ...trpc.cafe.joinRequests.queryOptions(), refetchInterval: 30000 });
  const markJoined = useMutation(trpc.cafe.markJoined.mutationOptions());
  const [form, setForm] = useState({ displayName: '', nidAut: '', nidSes: '' });

  if (isPending) return <Skeleton className="h-64 w-full" />;

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    toast.promise(save.mutateAsync(form), {
      loading: '저장 중...',
      success: () => {
        setForm({ displayName: '', nidAut: '', nidSes: '' });
        void queryClient.invalidateQueries(trpc.cafe.getBotSession.queryFilter());
        return '봇 계정 세션을 저장했습니다. 15초 안에 유효성이 확인됩니다.';
      },
      error: (err) => (err instanceof Error ? err.message : String(err)),
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>현재 세션</CardTitle>
            {data ? (
              data.valid === null ? <Badge variant="secondary">확인 중…</Badge>
              : data.valid ? <Badge>유효</Badge>
              : <Badge variant="destructive">만료</Badge>
            ) : (
              <Badge variant="outline">미등록</Badge>
            )}
          </div>
          <CardDescription>
            카페 대문 자동화에 쓰는 네이버 계정입니다. 세션이 만료되면 모든 스트리머의 자동화가 함께 멈추므로, 만료 표시가 뜨면 새 쿠키로 갱신해주세요.
          </CardDescription>
        </CardHeader>
        {data && (
          <CardContent className="grid gap-1 text-sm">
            <Row k="계정" v={data.displayName} />
            <Row k="NID_AUT" v={<span className="font-mono">{data.nidAut}</span>} />
            <Row k="NID_SES" v={<span className="font-mono">{data.nidSes}</span>} />
            <Row k="저장" v={new Date(data.updatedAt).toLocaleString('ko-KR')} />
            <Row k="마지막 확인" v={data.checkedAt ? new Date(data.checkedAt).toLocaleString('ko-KR') : '아직 없음'} />
            {data.checkMessage && <Row k="메시지" v={data.checkMessage} />}
            {data.valid === false && <Row k="만료 알림" v={data.alertedAt ? `${new Date(data.alertedAt).toLocaleString('ko-KR')} 운영자 메일 발송` : '발송 대기'} />}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>가입 요청 {joinRequests?.length ? `(${joinRequests.length})` : ''}</CardTitle>
          <CardDescription>
            카페 가입 폼에 보안문자가 있어 봇이 스스로 가입할 수 없습니다. 봇 계정으로 로그인한 브라우저에서 가입 페이지를 열어 직접 신청한 뒤 「가입 완료」를 누르세요. 가입 질문은 객관식은 첫 항목, 주관식은 &ldquo;위즈봇 가입신청&rdquo;으로 답하면 됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!joinRequests?.length ? (
            <p className="text-sm text-muted-foreground">대기 중인 요청이 없습니다.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {joinRequests.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">{request.cafeName ?? request.clubId}</span>
                    <span className="text-xs text-muted-foreground">
                      {request.user.channelName} · {request.requestedAt ? new Date(request.requestedAt).toLocaleString('ko-KR') : ''}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <a href={`https://cafe.naver.com/ca-fe/cafes/${request.clubId}/join`} target="_blank" rel="noreferrer">
                        가입 페이지
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      disabled={markJoined.isPending}
                      onClick={() =>
                        toast.promise(markJoined.mutateAsync({ id: request.id }), {
                          loading: '처리 중...',
                          success: () => {
                            void queryClient.invalidateQueries(trpc.cafe.joinRequests.queryFilter());
                            return '가입 완료로 표시했습니다. 스트리머에게 승인·스탭 지정 단계가 안내됩니다.';
                          },
                          error: (err) => (err instanceof Error ? err.message : String(err)),
                        })
                      }
                    >
                      가입 완료
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>세션 갱신</CardTitle>
          <CardDescription>
            봇 계정으로 네이버에 로그인한 브라우저의 개발자 도구 → Application → Cookies → naver.com 에서 <code className="font-mono">NID_AUT</code>·<code className="font-mono">NID_SES</code> 값을 복사합니다. 저장하면 이전 값을 덮어씁니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="name">계정 이름 (스트리머 안내용)</Label>
              <Input id="name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="위즈봇" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="aut">NID_AUT</Label>
              <Input id="aut" type="password" autoComplete="off" value={form.nidAut} onChange={(e) => setForm({ ...form, nidAut: e.target.value })} className="font-mono" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ses">NID_SES</Label>
              <Input id="ses" type="password" autoComplete="off" value={form.nidSes} onChange={(e) => setForm({ ...form, nidSes: e.target.value })} className="font-mono" />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={save.isPending || !form.displayName || !form.nidAut || !form.nidSes}>
                저장
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}
