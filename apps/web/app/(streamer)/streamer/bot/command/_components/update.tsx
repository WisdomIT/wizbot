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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import chatbotData from '@/src/chatbot';

import { CreateCommand, fetchCommandById, updateCommand } from '../_api/command';
import { Command } from './columns';
import { FunctionArgs, InputsEcho, InputsFunction } from './inputs';

export default function UpdateCommand({
  command: initialCommand,
  setUpdateTarget,
}: {
  command: Command | null;
  setUpdateTarget: (command: Command | null) => void;
}) {
  const [command, setCommand] = useState(initialCommand?.command ?? '');
  const [type, setType] = useState<'echo' | 'function'>(initialCommand?.type ?? 'echo');
  const [echo, setEcho] = useState('');
  const [functionArgs, setFunctionArgs] = useState<FunctionArgs>({
    type: 'API_QUERY',
    func: 'getChzzkTitle',
    permission: 'STREAMER',
  });

  useEffect(() => {
    if (!initialCommand) return;

    async function fetchCommand(initialCommand: Command) {
      const getCommand = await fetchCommandById(initialCommand.id, initialCommand.type);
      setCommand(getCommand.command);
      setType(getCommand.type);
      setEcho(getCommand.type === 'echo' ? getCommand.response : '');

      if (getCommand.type === 'function') {
        const thisFunction = chatbotData[getCommand.function];
        if (!thisFunction) {
          throw new Error('Function not found');
        }

        setFunctionArgs({
          type: thisFunction.type,
          func: getCommand.function,
          permission: getCommand.permission,
          option: getCommand.option,
        });
      }
    }

    void fetchCommand(initialCommand);
  }, [initialCommand]);

  async function handleClose() {
    setUpdateTarget(null);
    setCommand('');
    setType('echo');
    setEcho('');
    setFunctionArgs({
      type: 'API_QUERY',
      func: 'getChzzkTitle',
      permission: 'STREAMER',
    });
    setUpdateTarget(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!initialCommand) return;

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
        option: functionArgs.option ?? undefined,
      };
    }

    toast.promise(updateCommand({ id: initialCommand.id, ...data }), {
      loading: '명령어를 수정하는 중입니다...',
      success: () => {
        setUpdateTarget(null);
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

        return '명령어가 수정되었습니다.';
      },
      error: (error) => {
        return `명령어 수정에 실패했습니다. ${error}`;
      },
    });
  }

  return (
    <Dialog open={!!initialCommand} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>명령어 수정하기</DialogTitle>
          <DialogDescription>!{initialCommand?.command} 명령어를 수정합니다.</DialogDescription>
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
                disabled
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
