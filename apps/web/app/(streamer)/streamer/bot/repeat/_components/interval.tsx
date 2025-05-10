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

import { updateInterval } from '../_api/repeat';
export default function UpdateInterval({ interval: intervalInitial }: { interval: number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(intervalInitial);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    toast.promise(updateInterval(data), {
      loading: '기본 반복 주기를 변경하는 중입니다...',
      success: () => {
        setOpen(false);
        setData(intervalInitial);

        setTimeout(() => {
          location.reload();
        }, 500);

        return '기본 반복 주기가 변경되었습니다.';
      },
      error: (error) => {
        return `기본 반복 주기 변경에 실패했습니다. ${error}`;
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          기본 반복 주기 변경하기
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>기본 반복 주기 변경하기</DialogTitle>
          <DialogDescription>기본 반복 주기를 변경합니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                반복 주기 (초)
              </Label>
              <Input
                id="interval"
                type="number"
                value={data}
                onChange={(event) => {
                  setData(parseInt(event.target.value));
                }}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">수정하기</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
