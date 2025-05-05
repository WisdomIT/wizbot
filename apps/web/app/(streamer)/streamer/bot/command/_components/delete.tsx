'use client';

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

import { deleteCommand } from '../_api/command';
import { Command } from './columns';

export default function DeleteCommand({
  command,
  setDeleteTarget,
}: {
  command: Command | null;
  setDeleteTarget: (command: Command | null) => void;
}) {
  async function handleDeleteCommand(command: Command | null) {
    if (!command) return;
    const { id, type } = command;

    toast.promise(deleteCommand(id, type), {
      loading: '명령어 삭제 중...',
      success: () => {
        setTimeout(() => {
          location.reload();
        }, 1000);
        return '명령어가 삭제되었습니다.';
      },
    });
  }
  return (
    <Dialog open={!!command} onOpenChange={() => setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정말 이 명령어를 삭제하시겠습니까?</DialogTitle>
          <DialogDescription>
            삭제된 명령어는 복구할 수 없습니다. 정말 삭제하시겠습니까?
          </DialogDescription>
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>삭제 명령어</AlertTitle>
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
