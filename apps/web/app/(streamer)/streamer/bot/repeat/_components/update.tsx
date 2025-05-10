import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { updateRepeat } from '../_api/repeat';
import { Repeat } from './columns';

export default function UpdateCommand({
  repeat,
  setUpdateTarget,
}: {
  repeat: Repeat | null;
  setUpdateTarget: (repeat: Repeat | null) => void;
}) {
  const [data, setData] = useState<Repeat | null>(null);

  useEffect(() => {
    setData(repeat);
  }, [repeat]);

  async function handleClose() {
    setUpdateTarget(null);
    setData(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!data || !repeat) return;

    toast.promise(updateRepeat({ ...data, id: repeat.id }), {
      loading: '반복 메시지를 수정하는 중입니다...',
      success: () => {
        setUpdateTarget(null);
        setData(null);

        setTimeout(() => {
          location.reload();
        }, 500);

        return '반복 메시지가 수정되었습니다.';
      },
      error: (error) => {
        return `반복 메시지 수정에 실패했습니다. ${error}`;
      },
    });
  }

  return (
    <Dialog open={!!repeat} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>명령어 수정하기</DialogTitle>
          <DialogDescription>{repeat?.id}번 반복을 수정합니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {data ? (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="response" className="text-right">
                  메시지 (초)
                </Label>
                <Input
                  id="response"
                  value={data.response}
                  onChange={(event) => {
                    setData((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        response: event.target.value,
                      };
                    });
                  }}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="type" className="text-right">
                  반복 주기
                </Label>
                <Input
                  id="interval"
                  type="number"
                  value={data.interval}
                  onChange={(event) => {
                    setData((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        interval: parseInt(event.target.value),
                      };
                    });
                  }}
                  className="col-span-3"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button type="submit">수정하기</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
