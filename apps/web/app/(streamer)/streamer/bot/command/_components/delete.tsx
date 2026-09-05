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

import { Command } from './columns';

export default function DeleteCommand({
  command,
  setDeleteTarget,
}: {
  command: Command | null;
  setDeleteTarget: (command: Command | null) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const deleteCommand = useMutation(trpc.command.deleteCommand.mutationOptions());

  async function handleDeleteCommand(command: Command | null) {
    if (!command) return;
    const { id, type } = command;

    toast.promise(deleteCommand.mutateAsync({ id, type }), {
      loading: '명령어 삭제 중...',
      success: () => {
        void queryClient.invalidateQueries(trpc.command.getCommandList.queryFilter());
        return '명령어가 삭제되었습니다.';
      },
      error: (error) => `명령어 삭제에 실패했습니다. ${error}`,
    });
  }
  return (
    <Dialog open={!!command} onOpenChange={() => setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>이 명령어를 삭제할까요?</DialogTitle>
          <DialogDescription>
            삭제하면 복구할 수 없습니다.
          </DialogDescription>
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>삭제할 명령어</AlertTitle>
            <AlertDescription>!{command?.command}</AlertDescription>
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
                void handleDeleteCommand(command);
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
