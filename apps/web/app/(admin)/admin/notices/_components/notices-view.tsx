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
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

type Draft = { id: number | null; title: string; body: string; popup: boolean };
const EMPTY: Draft = { id: null, title: '', body: '', popup: false };

/** 공지사항 관리 (#206) — 목록 + 작성/수정 다이얼로그(마크다운 에디터), 팝업 공지 플래그 */
export function NoticesView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.notice.adminList.queryOptions());
  const create = useMutation(trpc.notice.create.mutationOptions());
  const update = useMutation(trpc.notice.update.mutationOptions());
  const remove = useMutation(trpc.notice.remove.mutationOptions());
  const [draft, setDraft] = useState<Draft | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.notice.adminList.queryFilter());
    void queryClient.invalidateQueries(trpc.notice.list.queryFilter());
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

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">랜딩·스트리머 콘솔·시청자 페이지에 마크다운(GFM)으로 표시됩니다.</p>
        <Button size="sm" onClick={() => setDraft(EMPTY)}><Plus className="size-4" /> 공지 작성</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>제목</TableHead>
            <TableHead className="w-24">팝업</TableHead>
            <TableHead className="w-44">작성일</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">공지사항이 없습니다.</TableCell></TableRow>
          ) : (
            data!.map((notice) => (
              <TableRow key={notice.id}>
                <TableCell className="font-medium">{notice.title}</TableCell>
                <TableCell>{notice.popup && <Badge variant="secondary">팝업</Badge>}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(notice.createdAt).toLocaleString('ko-KR')}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" aria-label="수정" onClick={() => setDraft({ id: notice.id, title: notice.title, body: notice.body, popup: notice.popup })}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="삭제"
                      onClick={() => {
                        if (confirm(`「${notice.title}」 공지를 삭제할까요?`)) run(remove.mutateAsync({ id: notice.id }), '삭제했습니다.');
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
            <DialogTitle>{draft?.id ? '공지 수정' : '공지 작성'}</DialogTitle>
            <DialogDescription>마크다운으로 작성합니다. 표·체크박스·취소선(GFM)을 지원합니다.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notice-title">제목</Label>
                <Input id="notice-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <MarkdownEditor value={draft.body} onChange={(body) => setDraft({ ...draft, body })} />
              <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                <div className="flex flex-col">
                  <Label htmlFor="notice-popup">팝업 공지</Label>
                  <span className="text-xs text-muted-foreground">스트리머가 콘솔에 처음 접속할 때 모달로 띄웁니다. 확인한 스트리머에게는 다시 뜨지 않습니다.</span>
                </div>
                <Switch id="notice-popup" checked={draft.popup} onCheckedChange={(popup) => setDraft({ ...draft, popup })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>취소</Button>
            <Button
              disabled={create.isPending || update.isPending || !draft?.title.trim() || !draft?.body.trim()}
              onClick={() => {
                if (!draft) return;
                if (draft.id) run(update.mutateAsync({ id: draft.id, title: draft.title, body: draft.body, popup: draft.popup }), '수정했습니다.');
                else run(create.mutateAsync({ title: draft.title, body: draft.body, popup: draft.popup }), '등록했습니다.');
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
