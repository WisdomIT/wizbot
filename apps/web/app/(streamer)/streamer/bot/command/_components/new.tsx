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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTRPC } from '@/src/utils/trpc-react';

import { FunctionArgs, InputsEcho, InputsFunction } from './inputs';

export default function NewCommand() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const createEcho = useMutation(trpc.command.createCommandEcho.mutationOptions());
  const createFunction = useMutation(trpc.command.createCommandFunction.mutationOptions());

  const [open, setOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [type, setType] = useState<'echo' | 'function'>('echo');
  const [echo, setEcho] = useState('');
  const [functionArgs, setFunctionArgs] = useState<FunctionArgs>({
    type: 'API_QUERY',
    func: 'getChzzkTitle',
    permission: 'STREAMER',
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const promise: Promise<unknown> =
      type === 'echo'
        ? createEcho.mutateAsync({ command, response: echo })
        : createFunction.mutateAsync({
            command,
            function: functionArgs.func,
            permission: functionArgs.permission,
            option: functionArgs.option,
          });

    toast.promise(promise, {
      loading: '명령어를 추가하는 중입니다...',
      success: () => {
        setOpen(false);
        setCommand('');
        setType('echo');
        setEcho('');
        setFunctionArgs({
          type: 'API_QUERY',
          func: 'getChzzkTitle',
          permission: 'STREAMER',
        });

        void queryClient.invalidateQueries(trpc.command.getCommandList.queryFilter());

        return '명령어가 추가되었습니다.';
      },
      error: (error) => {
        return `명령어 추가에 실패했습니다. ${error}`;
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          새 명령어 추가하기
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 명령어 추가하기</DialogTitle>
          <DialogDescription>시청자가 채팅에 입력하면 봇이 응답하는 명령어를 추가합니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="command" className="text-right">
                명령어
              </Label>
              <Input
                id="command"
                value={command}
                onChange={(event) => {
                  setCommand(event.target.value);
                }}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="type" className="text-right">
                타입
              </Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as 'echo' | 'function');
                }}
              >
                <SelectTrigger id="type" className="col-span-3">
                  <SelectValue placeholder="타입을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="echo">단순 응답 (echo)</SelectItem>
                  <SelectItem value="function">기능 (function)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type === 'echo' && <InputsEcho echo={echo} setEcho={setEcho} />}
            {type === 'function' && (
              <InputsFunction functionArgs={functionArgs} setFunctionArgs={setFunctionArgs} />
            )}
          </div>
          <DialogFooter>
            <Button type="submit">추가하기</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
