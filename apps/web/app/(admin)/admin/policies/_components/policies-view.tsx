'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { MarkdownEditor } from '@/components/custom/markdown-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

type PolicyType = 'TERMS' | 'PRIVACY';
type Draft = { id: number | null; type: PolicyType; version: string; publishedAt: string; body: string };

const TYPE_LABEL: Record<PolicyType, string> = { TERMS: '서비스 이용약관', PRIVACY: '개인정보처리방침' };
const TYPE_SLUG: Record<PolicyType, string> = { TERMS: 'terms', PRIVACY: 'privacy' };

/** 오늘 날짜를 <input type=date> 값(YYYY-MM-DD)으로 */
function today() {
  return new Date().toISOString().slice(0, 10);
}
function toDateInput(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

const EMPTY: Draft = { id: null, type: 'TERMS', version: '', publishedAt: today(), body: '' };

/** 약관 관리 (#252) — 종류·버전·등록 날짜 목록 + 작성/수정(마크다운) */
export function PoliciesView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.policy.adminList.queryOptions());
  const create = useMutation(trpc.policy.create.mutationOptions());
  const update = useMutation(trpc.policy.update.mutationOptions());
  const remove = useMutation(trpc.policy.remove.mutationOptions());
  const [draft, setDraft] = useState<Draft | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.policy.adminList.queryFilter());
  };
  const run = (promise: Promise<unknown>, success: string) =>
    toast.promise(promise, {
      loading: '처리 중...',
      success: () => {
        invalidate();
        setDraft(null);
        return success;
      },
      error: (err) => (err instanceof Error ? err.message : String(err)),
    });

  if (isPending) return <Skeleton className="my-4 h-96 w-full" />;

  //  종류별 현재(최신 등록일) 버전 id — 배지 표시용. adminList 는 type asc, publishedAt desc 정렬
  const currentByType = new Map<PolicyType, number>();
  for (const row of data ?? []) {
    if (!currentByType.has(row.type as PolicyType)) currentByType.set(row.type as PolicyType, row.id);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          종류별로 가장 최근 등록일의 버전이 현재 약관으로 공개됩니다. 본문은 마크다운(GFM)입니다.
        </p>
        <Button size="sm" onClick={() => setDraft(EMPTY)}><Plus className="size-4" /> 약관 등록</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">종류</TableHead>
            <TableHead className="w-28">버전</TableHead>
            <TableHead className="w-36">등록 날짜</TableHead>
            <TableHead className="w-20">상태</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">등록된 약관이 없습니다.</TableCell></TableRow>
          ) : (
            data!.map((policy) => (
              <TableRow key={policy.id}>
                <TableCell>
                  <a href={`/policy/${TYPE_SLUG[policy.type as PolicyType]}/${policy.id}`} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                    {TYPE_LABEL[policy.type as PolicyType]}
                  </a>
                </TableCell>
                <TableCell>{policy.version}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(policy.publishedAt).toLocaleDateString('ko-KR')}</TableCell>
                <TableCell>
                  {currentByType.get(policy.type as PolicyType) === policy.id && <Badge>현재</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="수정" onClick={() => setDraft({ id: policy.id, type: policy.type as PolicyType, version: policy.version, publishedAt: toDateInput(policy.publishedAt), body: policy.body })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="삭제"
                      onClick={() => {
                        if (confirm(`${TYPE_LABEL[policy.type as PolicyType]} 버전 ${policy.version} 을(를) 삭제할까요?`)) run(remove.mutateAsync({ id: policy.id }), '삭제했습니다.');
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? '약관 수정' : '약관 등록'}</DialogTitle>
            <DialogDescription>마크다운으로 작성합니다. 등록 날짜가 가장 최근인 버전이 공개됩니다.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="policy-type">종류</Label>
                  <Select value={draft.type} onValueChange={(type) => setDraft({ ...draft, type: type as PolicyType })}>
                    <SelectTrigger id="policy-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TERMS">서비스 이용약관</SelectItem>
                      <SelectItem value="PRIVACY">개인정보처리방침</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="policy-version">버전</Label>
                  <Input id="policy-version" placeholder="1.0" value={draft.version} onChange={(e) => setDraft({ ...draft, version: e.target.value })} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="policy-date">등록 날짜 (시행일)</Label>
                <Input id="policy-date" type="date" value={draft.publishedAt} onChange={(e) => setDraft({ ...draft, publishedAt: e.target.value })} className="w-44" />
              </div>
              <MarkdownEditor value={draft.body} onChange={(body) => setDraft({ ...draft, body })} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>취소</Button>
            <Button
              disabled={create.isPending || update.isPending || !draft?.version.trim() || !draft?.publishedAt || !draft?.body.trim()}
              onClick={() => {
                if (!draft) return;
                const payload = { type: draft.type, version: draft.version, publishedAt: draft.publishedAt, body: draft.body };
                if (draft.id) run(update.mutateAsync({ id: draft.id, ...payload }), '수정했습니다.');
                else run(create.mutateAsync(payload), '등록했습니다.');
              }}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
