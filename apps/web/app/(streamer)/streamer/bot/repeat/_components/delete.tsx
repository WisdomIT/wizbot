'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Terminal } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTRPC } from '@/src/utils/trpc-react';

import { Repeat } from './columns';

export default function DeleteCommand({
  repeat,
  setDeleteTarget,
}: {
  repeat: Repeat | null;
  setDeleteTarget: (repeat: Repeat | null) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const deleteRepeat = useMutation(trpc.command.deleteRepeat.mutationOptions());

  async function handleDeleteRepeat(repeat: Repeat | null) {
    if (!repeat) return;
    const { id } = repeat;

    toast.promise(deleteRepeat.mutateAsync({ id }), {
      loading: '반복 메시지 삭제 중...',
      success: () => {
        void queryClient.invalidateQueries(trpc.command.getRepeatList.queryFilter());
        return '반복 메시지가 삭제되었습니다.';
      },
    });
  }
  return (
    <Dialog open={!!repeat} onOpenChange={() => setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 반복 메시지를 삭제할까요?</DialogTitle>
          <DialogDescription>
            삭제하면 복구할 수 없습니다.
          </DialogDescription>
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>삭제할 반복 메시지</AlertTitle>
            <AlertDescription>{repeat?.response}</AlertDescription>
          </Alert>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void handleDeleteRepeat(repeat);
              }}
            >
              삭제
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
