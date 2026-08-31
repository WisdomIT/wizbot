'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { INQUIRY_STATUS_LABEL } from '@wizbot/shared/services/inquiry';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { MarkdownEditor } from '@/components/custom/markdown-editor';
import { MessageThread } from '@/components/inquiry/message-thread';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

/** 문의 스레드 (#206 3/3) — 열면 읽음 처리, 덧붙이면 다시 답변 대기 */
export function InquiryThreadView({ id }: { id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.inquiry.get.queryOptions({ id }));
  const reply = useMutation(trpc.inquiry.reply.mutationOptions());
  const [body, setBody] = useState('');

  if (isPending) return <Skeleton className="my-4 h-96 w-full" />;
  if (error) return <div className="py-8 text-sm text-muted-foreground">문의를 불러오지 못했습니다: {error.message}</div>;

  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.inquiry.get.queryFilter({ id }));
    void queryClient.invalidateQueries(trpc.inquiry.list.queryFilter());
    void queryClient.invalidateQueries(trpc.inquiry.unread.queryFilter());
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/streamer/inquiry"><ArrowLeft className="size-4" /> 문의사항</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-xl">{data.title}</CardTitle>
            <Badge variant={data.status === 'ANSWERED' ? 'default' : 'secondary'}>{INQUIRY_STATUS_LABEL[data.status]}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <MessageThread messages={data.messages} viewer="STREAMER" />
          <div className="flex flex-col gap-2 border-t pt-4">
            <MarkdownEditor value={body} onChange={setBody} rows={6} placeholder="덧붙일 내용을 마크다운으로 작성합니다." />
            <div className="flex justify-end">
              <Button
                disabled={reply.isPending || !body.trim()}
                onClick={() =>
                  toast.promise(reply.mutateAsync({ id, body }), {
                    loading: '등록 중...',
                    success: () => {
                      setBody('');
                      invalidate();
                      return '문의를 덧붙였습니다. 운영자에게 전달되었습니다.';
                    },
                    error: (err) => (err instanceof Error ? err.message : String(err)),
                  })
                }
              >
                등록
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
