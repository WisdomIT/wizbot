'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { MarkdownEditor } from '@/components/custom/markdown-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/src/utils/trpc-react';

/** 문의 작성 (#206 3/3) — 등록하면 운영자에게 메일이 간다 */
export function InquiryNewView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const create = useMutation(trpc.inquiry.create.mutationOptions());
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>문의 작성</CardTitle>
        <CardDescription>마크다운으로 작성합니다. 등록하면 운영자에게 전달되고, 답변이 달리면 문의사항에 표시됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="inquiry-title">제목</Label>
          <Input id="inquiry-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <MarkdownEditor value={body} onChange={setBody} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => router.push('/streamer/inquiry')}>취소</Button>
          <Button
            disabled={create.isPending || !title.trim() || !body.trim()}
            onClick={() =>
              toast.promise(create.mutateAsync({ title, body }), {
                loading: '등록 중...',
                success: (inquiry) => {
                  void queryClient.invalidateQueries(trpc.inquiry.list.queryFilter());
                  router.push(`/streamer/inquiry/${inquiry.id}`);
                  return '문의를 등록했습니다. 운영자에게 전달되었습니다.';
                },
                error: (err) => (err instanceof Error ? err.message : String(err)),
              })
            }
          >
            등록
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
