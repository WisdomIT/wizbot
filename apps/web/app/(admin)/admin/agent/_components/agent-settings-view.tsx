'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/src/utils/trpc-react';

const MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;

/** 설정 도우미 에이전트 (#35) — 키·모델·한도를 DB 로 관리 (#215 패턴). 키는 끝 4자만 보인다 */
export function AgentSettingsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.agent.adminSettings.queryOptions());
  const save = useMutation(trpc.agent.setAdminSettings.mutationOptions());
  const [form, setForm] = useState<{ apiKey: string; model: string; dailyTokenLimit: string; enabled: boolean } | null>(null);

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  const startEdit = () =>
    setForm({ apiKey: '', model: data.model, dailyTokenLimit: String(data.dailyTokenLimit), enabled: data.enabled });

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    toast.promise(
      save.mutateAsync({
        apiKey: form.apiKey,
        model: form.model as (typeof MODELS)[number],
        dailyTokenLimit: Number(form.dailyTokenLimit) || 500000,
        enabled: form.enabled,
      }),
      {
        loading: '저장 중...',
        success: () => {
          setForm(null);
          void queryClient.invalidateQueries(trpc.agent.adminSettings.queryFilter());
          return '에이전트 설정을 저장했습니다.';
        },
        error: (err) => (err instanceof Error ? err.message : String(err)),
      },
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>설정 도우미 에이전트</CardTitle>
            {data.configured ? (
              <Badge variant={data.enabled ? 'default' : 'secondary'}>{data.enabled ? '켜짐' : '꺼짐'}</Badge>
            ) : (
              <Badge variant="outline">미등록</Badge>
            )}
          </div>
          <CardDescription>
            스트리머 콘솔 우측의 채팅 도우미입니다. Anthropic API 키가 필요하며, 스트리머별 일일 토큰 한도로 비용을 제한합니다.
            끄면 콘솔에서 패널이 사라집니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!form ? (
            <>
              <div className="grid gap-1 text-sm">
                <Row k="API 키" v={data.maskedKey ? <span className="font-mono">{data.maskedKey}</span> : '(비어 있음)'} />
                <Row k="모델" v={<span className="font-mono">{data.model}</span>} />
                <Row k="일일 한도" v={`스트리머당 ${data.dailyTokenLimit.toLocaleString('ko-KR')} 토큰`} />
                {data.updatedAt && <Row k="저장" v={new Date(data.updatedAt).toLocaleString('ko-KR')} />}
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={startEdit}>{data.configured ? '변경' : '등록'}</Button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSave} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="agent-key">Anthropic API 키</Label>
                <Input
                  id="agent-key"
                  type="password"
                  autoComplete="new-password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder={data.configured ? '변경할 때만 입력' : 'sk-ant-…'}
                  className="font-mono"
                />
              </div>
              <div className="grid grid-cols-[1fr_10rem] gap-2">
                <div className="grid gap-1.5">
                  <Label>모델</Label>
                  <Select value={form.model} onValueChange={(model) => setForm({ ...form, model })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELS.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="agent-limit">일일 토큰 한도</Label>
                  <Input
                    id="agent-limit"
                    inputMode="numeric"
                    value={form.dailyTokenLimit}
                    onChange={(e) => setForm({ ...form, dailyTokenLimit: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">에이전트 사용</span>
                <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setForm(null)}>취소</Button>
                <Button type="submit" size="sm" disabled={save.isPending}>저장</Button>
              </div>
            </form>
          )}
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
