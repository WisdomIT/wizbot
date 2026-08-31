'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import Markdown from '@/components/custom/markdown';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 팝업 공지 (#206 2/3). 확인하지 않은 팝업 공지가 있으면 콘솔 진입 시 모달로 띄우고,
 * 「확인」이 읽음 처리라 같은 스트리머에게 다시 뜨지 않는다.
 */
export function NoticePopup() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useQuery(trpc.notice.unread.queryOptions());
  const markRead = useMutation(trpc.notice.markRead.mutationOptions());

  const popup = data?.popup ?? null;
  if (!popup) return null;

  const confirm = () => {
    markRead.mutate(
      { id: popup.id },
      { onSettled: () => void queryClient.invalidateQueries(trpc.notice.unread.queryFilter()) },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && confirm()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{popup.title}</DialogTitle>
          <DialogDescription>{new Date(popup.createdAt).toLocaleDateString('ko-KR')} 공지</DialogDescription>
        </DialogHeader>
        <div className="text-sm">
          <Markdown>{popup.body}</Markdown>
        </div>
        <DialogFooter>
          <Button onClick={confirm} disabled={markRead.isPending}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
