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

import { deleteRepeat } from '../_api/repeat';
import { Repeat } from './columns';

export default function DeleteCommand({
  repeat,
  setDeleteTarget,
}: {
  repeat: Repeat | null;
  setDeleteTarget: (repeat: Repeat | null) => void;
}) {
  async function handleDeleteRepeat(repeat: Repeat | null) {
    if (!repeat) return;
    const { id } = repeat;

    toast.promise(deleteRepeat(id), {
      loading: '반복 메시지 삭제 중...',
      success: () => {
        setTimeout(() => {
          location.reload();
        }, 1000);
        return '반복 메시지가 삭제되었습니다.';
      },
    });
  }
  return (
    <Dialog open={!!repeat} onOpenChange={() => setDeleteTarget(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정말 이 명령어를 삭제하시겠습니까?</DialogTitle>
          <DialogDescription>
            삭제된 명령어는 복구할 수 없습니다. 정말 삭제하시겠습니까?
          </DialogDescription>
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>삭제 반복 메시지</AlertTitle>
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
