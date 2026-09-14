'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

type Source = ReturnType<typeof useSources>['data'] extends (infer T)[] | undefined ? T : never;

function useSources() {
  const trpc = useTRPC();
  //  수집 중이면 끝날 때까지 5초마다 상태를 본다
  return useQuery({
    ...trpc.wiki.sources.queryOptions(),
    refetchInterval: (query) => (query.state.data?.some((row) => row.crawling) ? 5000 : false),
  });
}

interface Draft {
  id: number | null;
  name: string;
  baseUrl: string;
  enabled: boolean;
  endsAt: string;
  maxPages: string;
  viewerCooldownMinutes: string;
  perChannelDaily: string;
  globalDaily: string;
}

const EMPTY: Draft = { id: null, name: '', baseUrl: '', enabled: true, endsAt: '', maxPages: '150', viewerCooldownMinutes: '30', perChannelDaily: '200', globalDaily: '2000' };

function toDraft(source: Source): Draft {
  return {
    id: source.id,
    name: source.name,
    baseUrl: source.baseUrl,
    enabled: source.enabled,
    endsAt: source.endsAt ? new Date(source.endsAt).toISOString().slice(0, 10) : '',
    maxPages: String(source.maxPages),
    viewerCooldownMinutes: String(source.viewerCooldownMinutes),
    perChannelDaily: String(source.perChannelDaily),
    globalDaily: String(source.globalDaily),
  };
}

const fmt = (value: string | Date | null | undefined) => (value ? new Date(value).toLocaleString('ko-KR') : '없음');

/**
 * 위키 답변 (#309 1단계) — 소스(주소·기간·한도) 편집, 수집 상태, 「지금 수집」, 페이지 목록.
 * 답변 명령어는 2단계. 이번엔 소스 하나만 쓰지만 목록으로 그려 둔다
 */
export function WikiView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: sources, isPending } = useSources();
  const save = useMutation(trpc.wiki.saveSource.mutationOptions());
  const remove = useMutation(trpc.wiki.removeSource.mutationOptions());
  const crawl = useMutation(trpc.wiki.crawlNow.mutationOptions());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Source | null>(null);
  const [pagesOf, setPagesOf] = useState<number | null>(null);

  const invalidate = () => void queryClient.invalidateQueries(trpc.wiki.sources.queryFilter());
  const run = (promise: Promise<unknown>, messages: { loading: string; success: string | ((r: unknown) => string) }) =>
    toast.promise(promise, {
      loading: messages.loading,
      success: (r) => {
        invalidate();
        void queryClient.invalidateQueries(trpc.wiki.pages.queryFilter());
        return typeof messages.success === 'function' ? messages.success(r) : messages.success;
      },
      error: (err) => (err instanceof Error ? err.message : String(err)),
    });

  if (isPending || !sources) return <Skeleton className="my-4 h-96 w-full" />;

  const number = (value: string, fallback: number) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  };

  return (
    <div className="flex max-w-4xl flex-col gap-4 py-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          외부 위키를 1시간마다 수집해 두고, 시청자 질문에 그 내용만 근거로 답하는 명령어의 출처입니다. 남의 사이트라 요청은 1초에 하나씩 보내고,
          실패해도 마지막으로 읽어 둔 페이지로 답합니다.
        </p>
        {sources.length === 0 && (
          <Button size="sm" onClick={() => setDraft(EMPTY)}>소스 등록</Button>
        )}
      </div>

      {sources.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">등록된 위키가 없습니다.</p>}

      {sources.map((source) => {
        const active = source.enabled && (!source.endsAt || new Date(source.endsAt) > new Date());
        return (
          <Card key={source.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {source.name}
                    {active ? <Badge>동작 중</Badge> : source.enabled ? <Badge variant="secondary">종료됨</Badge> : <Badge variant="outline">꺼짐</Badge>}
                  </CardTitle>
                  <CardDescription>
                    <a href={source.baseUrl} target="_blank" rel="noreferrer" className="hover:underline">{source.baseUrl}</a>
                  </CardDescription>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" onClick={() => setDraft(toDraft(source))}>편집</Button>
                  <Button
                    size="sm"
                    disabled={crawl.isPending || source.crawling}
                    onClick={() =>
                      run(crawl.mutateAsync({ sourceId: source.id }), {
                        loading: '요청 중...',
                        success: '수집을 시작했습니다. 1초에 한 페이지씩 읽으므로 몇 분 걸립니다.',
                      })
                    }
                  >
                    {source.crawling ? '수집 중…' : '지금 수집'}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted-foreground">마지막 수집</dt>
                <dd>{fmt(source.lastCrawledAt)}</dd>
                <dt className="text-muted-foreground">페이지</dt>
                <dd>{source._count.pages.toLocaleString('ko-KR')}개 (최대 {source.maxPages})</dd>
                <dt className="text-muted-foreground">종료일</dt>
                <dd>{source.endsAt ? new Date(source.endsAt).toLocaleDateString('ko-KR') : '없음'}</dd>
                <dt className="text-muted-foreground">제한</dt>
                <dd>시청자 쿨타임 {source.viewerCooldownMinutes}분 · 채널 {source.perChannelDaily || '무제한'}건/일 · 전체 {source.globalDaily || '무제한'}건/일</dd>
                {source.lastError && (
                  <>
                    <dt className="text-muted-foreground">오류</dt>
                    <dd className="text-destructive">{source.lastError}{source.consecutiveFailures > 0 && ` (연속 ${source.consecutiveFailures}회)`}</dd>
                  </>
                )}
              </dl>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPagesOf(pagesOf === source.id ? null : source.id)}>
                  {pagesOf === source.id ? '페이지 접기' : '페이지 보기'}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRemoveTarget(source)}>삭제</Button>
              </div>
              {pagesOf === source.id && <PagesTable sourceId={source.id} />}
            </CardContent>
          </Card>
        );
      })}

      <ConfirmDialog
        open={removeTarget !== null}
        title="위키 소스 삭제"
        description={removeTarget ? `${removeTarget.name}과 수집한 페이지를 모두 삭제합니다. 되돌릴 수 없습니다.` : ''}
        confirmLabel="삭제"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          const target = removeTarget;
          setRemoveTarget(null);
          run(remove.mutateAsync({ id: target.id }), { loading: '삭제 중...', success: '삭제했습니다.' });
        }}
      />

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{draft.id ? '소스 편집' : '소스 등록'}</CardTitle>
            <CardDescription>주소를 바꾸면 수집한 페이지는 비워지고 다음 수집에서 다시 채워집니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                run(
                  save.mutateAsync({
                    id: draft.id,
                    name: draft.name,
                    baseUrl: draft.baseUrl,
                    enabled: draft.enabled,
                    endsAt: draft.endsAt ? new Date(`${draft.endsAt}T23:59:59+09:00`) : null,
                    maxPages: number(draft.maxPages, 150) || 150,
                    viewerCooldownMinutes: number(draft.viewerCooldownMinutes, 30),
                    perChannelDaily: number(draft.perChannelDaily, 200),
                    globalDaily: number(draft.globalDaily, 2000),
                  }),
                  { loading: '저장 중...', success: '저장했습니다.' },
                ).unwrap().then(() => setDraft(null)).catch(() => {});
              }}
            >
              <Field label="이름 (출처 표기)"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="봉누도 2 위키" /></Field>
              <Field label="주소"><Input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://bongnudo.super.site/" /></Field>
              <Field label="종료일 (한국 시간, 그날까지)"><Input type="date" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} /></Field>
              <Field label="최대 페이지"><Input type="number" min={1} max={500} value={draft.maxPages} onChange={(e) => setDraft({ ...draft, maxPages: e.target.value })} /></Field>
              <Field label="시청자 쿨타임 (분)"><Input type="number" min={0} value={draft.viewerCooldownMinutes} onChange={(e) => setDraft({ ...draft, viewerCooldownMinutes: e.target.value })} /></Field>
              <Field label="채널 일일 상한 (0 = 무제한)"><Input type="number" min={0} value={draft.perChannelDaily} onChange={(e) => setDraft({ ...draft, perChannelDaily: e.target.value })} /></Field>
              <Field label="전체 일일 상한 (0 = 무제한)"><Input type="number" min={0} value={draft.globalDaily} onChange={(e) => setDraft({ ...draft, globalDaily: e.target.value })} /></Field>
              <div className="flex items-center gap-2 self-end">
                <Switch id="wiki-enabled" checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
                <Label htmlFor="wiki-enabled">사용</Label>
              </div>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={save.isPending || !draft.name.trim() || !draft.baseUrl.trim()}>저장</Button>
                <Button type="button" variant="outline" onClick={() => setDraft(null)}>취소</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function PagesTable({ sourceId }: { sourceId: number }) {
  const trpc = useTRPC();
  const { data, isPending } = useQuery(trpc.wiki.pages.queryOptions({ sourceId }));
  if (isPending || !data) return <Skeleton className="h-40 w-full" />;
  if (data.length === 0) return <p className="text-sm text-muted-foreground">아직 수집한 페이지가 없습니다. 「지금 수집」을 눌러보세요.</p>;
  return (
    <div className="max-h-96 overflow-y-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>페이지</TableHead>
            <TableHead className="w-44">마지막 변경</TableHead>
            <TableHead className="w-44">마지막 확인</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((page) => (
            <TableRow key={page.id}>
              <TableCell>
                <a href={page.url} target="_blank" rel="noreferrer" className="hover:underline">{page.title}</a>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{page.url}</div>
              </TableCell>
              <TableCell className="text-muted-foreground">{fmt(page.changedAt)}</TableCell>
              <TableCell className="text-muted-foreground">{fmt(page.fetchedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
