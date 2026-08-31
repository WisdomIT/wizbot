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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

/** 문의 스레드 — 어드민 (#206 3/3). 답변하면 「답변 완료」가 되고 스트리머 쪽에 새 답변 표시가 뜬다 */
export function AdminInquiryThreadView({ id }: { id: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.inquiry.adminGet.queryOptions({ id }));
  const reply = useMutation(trpc.inquiry.adminReply.mutationOptions());
  const [body, setBody] = useState('');

  if (isPending) return <Skeleton className="my-4 h-96 w-full" />;
  if (error) return <div className="py-8 text-sm text-muted-foreground">문의를 불러오지 못했습니다: {error.message}</div>;

  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.inquiry.adminGet.queryFilter({ id }));
    void queryClient.invalidateQueries(trpc.inquiry.adminList.queryFilter());
    void queryClient.invalidateQueries(trpc.inquiry.adminUnread.queryFilter());
  };

  return (
    <div className="flex flex-col gap-3 py-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/admin/inquiries"><ArrowLeft className="size-4" /> 문의사항</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-xl">{data.title}</CardTitle>
            <Badge variant={data.status === 'ANSWERED' ? 'default' : 'secondary'}>{INQUIRY_STATUS_LABEL[data.status]}</Badge>
          </div>
          <CardDescription>{data.user.channelName} · {new Date(data.createdAt).toLocaleString('ko-KR')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <MessageThread messages={data.messages} viewer="ADMIN" />
          <div className="flex flex-col gap-2 border-t pt-4">
            <MarkdownEditor value={body} onChange={setBody} rows={6} placeholder="답변을 마크다운으로 작성합니다." />
            <div className="flex justify-end">
              <Button
                disabled={reply.isPending || !body.trim()}
                onClick={() =>
                  toast.promise(reply.mutateAsync({ id, body }), {
                    loading: '등록 중...',
                    success: () => {
                      setBody('');
                      invalidate();
                      return '답변을 등록했습니다.';
                    },
                    error: (err) => (err instanceof Error ? err.message : String(err)),
                  })
                }
              >
                답변 등록
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
