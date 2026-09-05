import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTRPC } from '@/src/utils/trpc-react';
export default function NewRepeat({ interval: intervalInitial }: { interval: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const createRepeat = useMutation(trpc.command.createRepeat.mutationOptions());

  const [open, setOpen] = useState(false);
  const [data, setData] = useState({
    response: '',
    interval: intervalInitial,
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    toast.promise(createRepeat.mutateAsync(data), {
      loading: '반복 메시지를 추가하는 중입니다...',
      success: () => {
        setOpen(false);
        setData({
          response: '',
          interval: intervalInitial,
        });

        void queryClient.invalidateQueries(trpc.command.getRepeatList.queryFilter());

        return '반복 메시지가 추가되었습니다.';
      },
      error: (error) => {
        return `반복 메시지 추가에 실패했습니다. ${error}`;
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          새 반복 추가하기
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 반복 추가하기</DialogTitle>
          <DialogDescription>봇이 정해진 주기마다 채팅에 메시지를 보냅니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="response" className="text-right">
                메시지
              </Label>
              <Input
                id="response"
                maxLength={100}
                value={data.response}
                onChange={(event) => {
                  setData((prev) => ({
                    ...prev,
                    response: event.target.value,
                  }));
                }}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                반복 주기 (초)
              </Label>
              <Input
                id="interval"
                type="number"
                value={data.interval}
                onChange={(event) => {
                  setData((prev) => ({
                    ...prev,
                    interval: parseInt(event.target.value),
                  }));
                }}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">추가하기</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
