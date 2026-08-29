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
  const { data, isPending } = useQuery(trpc.cafe.getBotSession.queryOptions());
  const save = useMutation(trpc.cafe.setBotSession.mutationOptions());
  const [form, setForm] = useState({ displayName: '', nidAut: '', nidSes: '' });

  if (isPending) return <Skeleton className="h-64 w-full" />;

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    toast.promise(save.mutateAsync(form), {
      loading: '저장 중...',
      success: () => {
        setForm({ displayName: '', nidAut: '', nidSes: '' });
        void queryClient.invalidateQueries(trpc.cafe.getBotSession.queryFilter());
        return '봇 계정 세션을 저장했습니다. 워커가 곧 유효성을 확인합니다.';
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
              data.valid === null ? <Badge variant="secondary">확인 대기</Badge>
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
          </CardContent>
        )}
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
