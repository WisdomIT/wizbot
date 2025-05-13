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

import { CreateCommand, createCommand } from '../_api/command';
import { FunctionArgs, InputsEcho, InputsFunction } from './inputs';

export default function NewCommand() {
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

    let data: CreateCommand;
    if (type === 'echo') {
      data = {
        command,
        type: 'echo',
        response: echo,
      };
    } else {
      data = {
        command,
        type: 'function',
        function: functionArgs.func,
        permission: functionArgs.permission,
        option: functionArgs.option,
      };
    }

    toast.promise(createCommand(data), {
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

        setTimeout(() => {
          location.reload();
        }, 500);

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
          <DialogDescription>새 echo 혹은 function 명령어를 추가합니다.</DialogDescription>
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
                  <SelectItem value="echo">echo</SelectItem>
                  <SelectItem value="function">function</SelectItem>
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
