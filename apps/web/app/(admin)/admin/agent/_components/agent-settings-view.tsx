'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
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

/**
 * 설정 도우미 에이전트 (#35, pelican-concierge 구조).
 * 프로바이더는 순서 있는 목록(1순위 장애 시 다음 순위가 이어받음), 한도는 기준×범위×주기 규칙.
 */

type ProviderKind = 'ANTHROPIC' | 'OPENAI' | 'GEMINI' | 'OPENAI_COMPAT';

/** 프로바이더별 능력 — 지원 안 하는 입력은 폼에서 꺼져 있어야 한다 (shared AGENT_PROVIDER_CAPS 와 동일 값 유지) */
const CAPS: Record<ProviderKind, { label: string; needsBaseUrl: boolean; needsKey: boolean }> = {
  ANTHROPIC: { label: 'Anthropic (Claude)', needsBaseUrl: false, needsKey: true },
  OPENAI: { label: 'OpenAI (ChatGPT)', needsBaseUrl: false, needsKey: true },
  GEMINI: { label: 'Google (Gemini)', needsBaseUrl: false, needsKey: true },
  OPENAI_COMPAT: { label: 'OpenAI 호환 (로컬 LLM)', needsBaseUrl: true, needsKey: false },
};

const METRIC_LABEL = { TOKENS: '토큰', MESSAGES: '채팅 수' } as const;
const SCOPE_LABEL = { STREAMER: '스트리머당', GLOBAL: '전체' } as const;
const PERIOD_LABEL = { HOUR: '시간', DAY: '일', WEEK: '주', MONTH: '월' } as const;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function AgentSettingsView() {
  return (
    <div className="flex max-w-2xl flex-col gap-4 py-4">
      <GlobalCard />
      <ProvidersCard />
      <LimitsCard />
    </div>
  );
}

function GlobalCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.agent.adminSettings.queryOptions());
  const save = useMutation(trpc.agent.setAdminSettings.mutationOptions());

  if (isPending || !data) return <Skeleton className="h-32 w-full" />;

  const toggle = (patch: Partial<{ enabled: boolean; webSearchEnabled: boolean; allowConversationDelete: boolean }>) =>
    toast.promise(save.mutateAsync({ ...data, ...patch }), {
      loading: '변경 중...',
      success: () => {
        void queryClient.invalidateQueries(trpc.agent.adminSettings.queryFilter());
        return '저장했습니다.';
      },
      error: errorText,
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>설정 도우미 에이전트</CardTitle>
        <CardDescription>
          스트리머 콘솔 우측의 채팅 도우미입니다. 끄면 콘솔에서 패널이 사라집니다.
          웹 검색은 지원하는 프로바이더(Anthropic·OpenAI·Gemini)에서만 동작합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
          <span className="text-sm font-medium">에이전트 사용</span>
          <Switch checked={data.enabled} disabled={save.isPending} onCheckedChange={(enabled) => toggle({ enabled })} />
        </div>
        <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
          <span className="text-sm font-medium">웹 검색 허용</span>
          <Switch checked={data.webSearchEnabled} disabled={save.isPending} onCheckedChange={(webSearchEnabled) => toggle({ webSearchEnabled })} />
        </div>
        <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
          <div className="flex flex-col">
            <span className="text-sm font-medium">대화 삭제 허용</span>
            <span className="text-xs text-muted-foreground">스트리머 목록에서만 사라지고 관리자 로그·사용량에는 남습니다</span>
          </div>
          <Switch checked={data.allowConversationDelete} disabled={save.isPending} onCheckedChange={(allowConversationDelete) => toggle({ allowConversationDelete })} />
        </div>
      </CardContent>
    </Card>
  );
}

interface ProviderRow {
  id: number;
  name: string;
  kind: ProviderKind;
  maskedKey: string | null;
  baseUrl: string | null;
  model: string;
  enabled: boolean;
}

function ProvidersCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.agent.providers.queryOptions());
  const move = useMutation(trpc.agent.moveProvider.mutationOptions());
  const remove = useMutation(trpc.agent.deleteProvider.mutationOptions());
  //  수정 폼은 각 항목 바로 아래 인라인으로 (pelican 방식) — 다른 항목의 수정을 누르면 그쪽으로 전환된다
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const refresh = () => queryClient.invalidateQueries(trpc.agent.providers.queryFilter());

  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>모델 (프로바이더)</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setEditingId(editingId === 'new' ? null : 'new')}>
            <Plus className="size-4" /> 추가
          </Button>
        </div>
        <CardDescription>
          위에서부터 순서대로 시도합니다. 1순위가 응답하지 못하면(크레딧 소진·쿼터·장애) 다음 순위가 이어받고,
          장애·복귀는 알림 설정의 「오류 알림」 채널로 통지됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {data.length === 0 && editingId !== 'new' && (
          <p className="py-2 text-sm text-muted-foreground">등록된 모델이 없습니다. 에이전트가 동작하려면 최소 하나가 필요합니다.</p>
        )}
        {data.map((row, index) => (
          <div key={row.id} className="flex flex-col py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{index + 1}순위</span>
                  <span className="truncate text-sm font-medium">{row.name}</span>
                  {!row.enabled && <Badge variant="secondary">꺼짐</Badge>}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {CAPS[row.kind].label} · <span className="font-mono">{row.model}</span>
                  {row.maskedKey ? <> · 키 <span className="font-mono">{row.maskedKey}</span></> : null}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="icon" variant="ghost" className="size-8" aria-label="위로" disabled={index === 0 || move.isPending}
                  onClick={() => move.mutate({ id: row.id, direction: 'up' }, { onSuccess: () => void refresh() })}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="아래로" disabled={index === data.length - 1 || move.isPending}
                  onClick={() => move.mutate({ id: row.id, direction: 'down' }, { onSuccess: () => void refresh() })}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="수정"
                  onClick={() => setEditingId(editingId === row.id ? null : row.id)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="삭제" disabled={remove.isPending}
                  onClick={() =>
                    toast.promise(remove.mutateAsync({ id: row.id }), {
                      loading: '삭제 중...',
                      success: () => {
                        void refresh();
                        return `${row.name} 을 삭제했습니다.`;
                      },
                      error: errorText,
                    })
                  }>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {editingId === row.id && (
              //  key — 다른 항목으로 전환할 때 폼 상태가 섞이지 않도록
              <ProviderForm key={row.id} row={row} onClose={() => setEditingId(null)} onSaved={() => void refresh()} />
            )}
          </div>
        ))}
        {editingId === 'new' && (
          <div className="py-3 last:pb-0">
            <ProviderForm key="new" row={null} onClose={() => setEditingId(null)} onSaved={() => void refresh()} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderForm({ row, onClose, onSaved }: { row: ProviderRow | null; onClose: () => void; onSaved: () => void }) {
  const trpc = useTRPC();
  const create = useMutation(trpc.agent.createProvider.mutationOptions());
  const update = useMutation(trpc.agent.updateProvider.mutationOptions());
  const probe = useMutation(trpc.agent.probeProvider.mutationOptions());
  const [form, setForm] = useState({
    kind: (row?.kind ?? 'ANTHROPIC') as ProviderKind,
    name: row?.name ?? '',
    apiKey: '',
    baseUrl: row?.baseUrl ?? '',
    model: row?.model ?? '',
    enabled: row?.enabled ?? true,
  });
  //  기존 항목은 저장된 키로 열리자마자 모델 목록을 불러온다 (pelican: 폼 렌더 경로에서 probe)
  const stored = useQuery({
    ...trpc.agent.providerModels.queryOptions({ providerId: row?.id ?? 0 }),
    enabled: !!row,
    retry: false,
  });
  //  「연결 확인」(입력한 키)이 성공하면 그 결과가 우선한다
  const [probedModels, setProbedModels] = useState<{ id: string; label: string }[] | null>(null);
  const models = probedModels ?? stored.data?.models ?? null;
  const loadingModels = !!row && !probedModels && stored.isPending;
  const modelsError = !probedModels && stored.error ? (stored.error instanceof Error ? stored.error.message : String(stored.error)) : null;
  const caps = CAPS[form.kind];
  const pending = create.isPending || update.isPending;

  function handleProbe() {
    toast.promise(
      probe.mutateAsync({ kind: form.kind, apiKey: form.apiKey, baseUrl: form.baseUrl || null, providerId: row?.id ?? null }),
      {
        loading: '연결 확인 중...',
        success: (result) => {
          setProbedModels(result.models);
          return `연결 확인 완료 — 사용할 수 있는 모델 ${result.models.length}개`;
        },
        error: errorText,
      },
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const payload = { name: form.name, apiKey: form.apiKey, baseUrl: form.baseUrl || null, model: form.model };
    toast.promise(
      row
        ? update.mutateAsync({ id: row.id, ...payload, enabled: form.enabled })
        : create.mutateAsync({ ...payload, kind: form.kind }),
      {
        loading: '저장 중...',
        success: () => {
          onSaved();
          onClose();
          return '저장했습니다.';
        },
        error: errorText,
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 grid gap-3 rounded-md border p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label>종류</Label>
          <Select
            value={form.kind}
            disabled={!!row}
            onValueChange={(kind) => {
              setForm({ ...form, kind: kind as ProviderKind, model: '' });
              setProbedModels(null);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(CAPS) as ProviderKind[]).map((kind) => (
                <SelectItem key={kind} value={kind}>{CAPS[kind].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p-name">표시명</Label>
          <Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={CAPS[form.kind].label} />
        </div>
      </div>
      {caps.needsKey && (
        <div className="grid gap-1.5">
          <Label htmlFor="p-key">API 키</Label>
          <Input id="p-key" type="password" autoComplete="new-password" value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder={row?.maskedKey ? '변경할 때만 입력' : ''} className="font-mono" />
        </div>
      )}
      {caps.needsBaseUrl && (
        <div className="grid gap-1.5">
          <Label htmlFor="p-url">엔드포인트 주소 (base URL)</Label>
          <Input id="p-url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" className="font-mono" />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {row ? '키를 바꿨다면 「연결 확인」으로 다시 검증하세요.' : '연결 확인을 누르면 키를 검증하고 사용할 수 있는 모델 목록을 불러옵니다.'}
        </p>
        <Button type="button" size="sm" variant="outline" disabled={probe.isPending} onClick={handleProbe}>
          연결 확인
        </Button>
      </div>
      <div className="grid gap-1.5">
        <Label>모델</Label>
        <Select value={form.model || undefined} disabled={!models || models.length === 0} onValueChange={(model) => setForm({ ...form, model })}>
          <SelectTrigger className="font-mono">
            <SelectValue
              placeholder={
                loadingModels ? '모델 불러오는 중…'
                : models ? (models.length > 0 ? '모델 선택' : '사용할 수 있는 모델이 없습니다')
                : '연결 확인 후 선택할 수 있습니다'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {form.model && !(models ?? []).some((model) => model.id === form.model) && (
              <SelectItem value={form.model}>{form.model} (현재 값)</SelectItem>
            )}
            {(models ?? []).map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {model.label === model.id ? model.id : `${model.label} (${model.id})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modelsError && (
          <p className="text-xs text-destructive">모델 목록을 불러오지 못했습니다: {modelsError} — 키를 확인하고 「연결 확인」을 눌러주세요.</p>
        )}
      </div>
      {row && (
        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <span className="text-sm">사용</span>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onClose}>취소</Button>
        <Button type="submit" size="sm" disabled={pending || !form.model}>저장</Button>
      </div>
    </form>
  );
}

function LimitsCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.agent.limits.queryOptions());
  const add = useMutation(trpc.agent.addLimit.mutationOptions());
  const remove = useMutation(trpc.agent.removeLimit.mutationOptions());
  const [form, setForm] = useState({ metric: 'TOKENS' as keyof typeof METRIC_LABEL, scope: 'STREAMER' as keyof typeof SCOPE_LABEL, period: 'DAY' as keyof typeof PERIOD_LABEL, amount: '' });
  const refresh = () => queryClient.invalidateQueries(trpc.agent.limits.queryFilter());

  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>사용 한도</CardTitle>
        <CardDescription>
          무엇을(토큰·채팅 수) · 누구에게(스트리머당·전체) · 어느 기간(시간~월) 기준으로 제한할지 정하는 규칙을
          여러 개 만들 수 있습니다. 규칙은 모두 함께 적용되어 하나라도 넘으면 차단되고, 규칙이 없으면 무제한입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data.length > 0 && (
          <ul className="flex flex-col divide-y">
            {data.map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {SCOPE_LABEL[row.scope]} · {PERIOD_LABEL[row.period]}당 {METRIC_LABEL[row.metric]}{' '}
                  <span className="font-medium">{row.amount.toLocaleString('ko-KR')}</span>
                </span>
                <Button size="icon" variant="ghost" className="size-8" aria-label="규칙 삭제" disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: row.id }, { onSuccess: () => void refresh() })}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            toast.promise(add.mutateAsync({ ...form, amount: Number(form.amount) }), {
              loading: '추가 중...',
              success: () => {
                setForm({ ...form, amount: '' });
                void refresh();
                return '규칙을 추가했습니다.';
              },
              error: errorText,
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label>범위</Label>
            <Select value={form.scope} onValueChange={(scope) => setForm({ ...form, scope: scope as typeof form.scope })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SCOPE_LABEL) as (keyof typeof SCOPE_LABEL)[]).map((key) => <SelectItem key={key} value={key}>{SCOPE_LABEL[key]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>주기</Label>
            <Select value={form.period} onValueChange={(period) => setForm({ ...form, period: period as typeof form.period })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PERIOD_LABEL) as (keyof typeof PERIOD_LABEL)[]).map((key) => <SelectItem key={key} value={key}>{PERIOD_LABEL[key]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>기준</Label>
            <Select value={form.metric} onValueChange={(metric) => setForm({ ...form, metric: metric as typeof form.metric })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(METRIC_LABEL) as (keyof typeof METRIC_LABEL)[]).map((key) => <SelectItem key={key} value={key}>{METRIC_LABEL[key]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="l-amount">값</Label>
            <Input id="l-amount" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <Button type="submit" size="sm" disabled={add.isPending || !form.amount}>추가</Button>
        </form>
      </CardContent>
    </Card>
  );
}
