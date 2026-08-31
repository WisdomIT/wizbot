import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chatbotFunctionDefinitionMap,
  isChatbotFunctionKey,
} from '@wizbot/shared/chatbot/definitions';
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
import { useTRPC } from '@/src/utils/trpc-react';

import { Command } from './columns';
import { FunctionArgs, InputsEcho, InputsFunction } from './inputs';

export default function UpdateCommand({
  command: initialCommand,
  setUpdateTarget,
}: {
  command: Command | null;
  setUpdateTarget: (command: Command | null) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const updateCommand = useMutation(trpc.command.updateCommand.mutationOptions());
  const { data: getCommand } = useQuery(
    trpc.command.getCommandById.queryOptions(
      { id: initialCommand?.id ?? 0, type: initialCommand?.type ?? 'echo' },
      { enabled: !!initialCommand },
    ),
  );

  const [command, setCommand] = useState(initialCommand?.command ?? '');
  const [type, setType] = useState<'echo' | 'function'>(initialCommand?.type ?? 'echo');
  const [echo, setEcho] = useState('');
  const [functionArgs, setFunctionArgs] = useState<FunctionArgs>({
    type: 'API_QUERY',
    func: 'getChzzkTitle',
    permission: 'STREAMER',
  });

  //  서버에서 온 명령을 폼에 반영 — effect 대신 렌더 중 보정 (#200, react.dev 「이전 렌더 값 저장」 패턴)
  const [prevCommandData, setPrevCommandData] = useState(getCommand);
  if (getCommand && prevCommandData !== getCommand) {
    setPrevCommandData(getCommand);
    setCommand(getCommand.command);
    setType(getCommand.type);
    setEcho(getCommand.type === 'echo' ? getCommand.response : '');
    if (getCommand.type === 'function' && isChatbotFunctionKey(getCommand.function)) {
      setFunctionArgs({
        type: chatbotFunctionDefinitionMap[getCommand.function].type,
        func: getCommand.function,
        permission: getCommand.permission,
        option: getCommand.option ?? undefined,
      });
    }
  }

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
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!initialCommand) return;

    const promise =
      type === 'echo'
        ? updateCommand.mutateAsync({
            type: 'echo',
            id: initialCommand.id,
            command,
            response: echo,
          })
        : updateCommand.mutateAsync({
            type: 'function',
            id: initialCommand.id,
            command,
            function: functionArgs.func,
            permission: functionArgs.permission,
            option: functionArgs.option ?? undefined,
          });

    toast.promise(promise, {
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

        void queryClient.invalidateQueries(trpc.command.getCommandList.queryFilter());
        void queryClient.invalidateQueries(trpc.command.getCommandById.queryFilter());

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
