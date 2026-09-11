'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chatbotFunctionDefinitionMap,
  isChatbotFunctionKey,
} from '@wizbot/shared/chatbot/definitions';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/confirm-dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

import { Command } from './columns';
import { FunctionArgs, InputsEcho, InputsFunction } from './inputs';

/** confirm 문구용 (#262) — 넓히려는 권한에 맞춰 */
const PERMISSION_LABEL: Record<FunctionArgs['permission'], string> = {
  STREAMER: '스트리머',
  MANAGER: '매니저',
  VIEWER: '시청자',
};

/** getCommandById 응답 */
type CommandDetail = NonNullable<ReturnType<typeof useCommandDetail>['data']>;

function useCommandDetail(command: Command | null) {
  const trpc = useTRPC();
  return useQuery(
    trpc.command.getCommandById.queryOptions(
      { id: command?.id ?? 0, type: command?.type ?? 'echo' },
      { enabled: !!command },
    ),
  );
}

export default function UpdateCommand({
  command: initialCommand,
  setUpdateTarget,
}: {
  command: Command | null;
  setUpdateTarget: (command: Command | null) => void;
}) {
  const { data: detail } = useCommandDetail(initialCommand);
  const close = () => setUpdateTarget(null);

  return (
    <Dialog open={!!initialCommand} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>명령어 수정하기</DialogTitle>
          <DialogDescription>!{initialCommand?.command} 명령어를 수정합니다.</DialogDescription>
        </DialogHeader>
        {/*
          명령어마다 폼을 새로 마운트해 서버 값을 초기값으로 잡는다 (#263).
          닫으면 언마운트되므로 같은 명령어를 다시 열어도 — 캐시가 같은 참조를 돌려줘도 — 현재 값이 채워진다
        */}
        {initialCommand && detail ? (
          <UpdateCommandForm
            key={initialCommand.id}
            id={initialCommand.id}
            detail={detail}
            onDone={close}
          />
        ) : (
          <Skeleton className="my-4 h-40 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UpdateCommandForm({
  id,
  detail,
  onDone,
}: {
  id: number;
  detail: CommandDetail;
  onDone: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const updateCommand = useMutation(trpc.command.updateCommand.mutationOptions());

  const [command, setCommand] = useState(detail.command);
  const type = detail.type;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [echo, setEcho] = useState(detail.type === 'echo' ? detail.response : '');
  const [functionArgs, setFunctionArgs] = useState<FunctionArgs>(() =>
    detail.type === 'function' && isChatbotFunctionKey(detail.function)
      ? {
          type: chatbotFunctionDefinitionMap[detail.function].type,
          func: detail.function,
          permission: detail.permission,
          option: detail.option ?? undefined,
        }
      : { type: 'API_QUERY', func: 'getChzzkTitle', permission: 'STREAMER' },
  );

  /**
   * 에이전트 명령어의 권한을 스트리머 밖으로 넓힐 때만 한 번 확인한다 (#262) — 에이전트는 방송 설정·채팅 제한까지
   * 실행하므로. 다른 명령어와, 이미 넓혀져 있던 권한을 그대로 두는 저장에는 띄우지 않는다
   */
  const widensAgentPermission =
    detail.type === 'function' &&
    detail.function === 'agentChat' &&
    functionArgs.permission !== 'STREAMER' &&
    functionArgs.permission !== detail.permission;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (widensAgentPermission) {
      setConfirmOpen(true);
      return;
    }
    submit();
  }

  function submit() {
    const promise =
      type === 'echo'
        ? updateCommand.mutateAsync({ type: 'echo', id, command, response: echo })
        : updateCommand.mutateAsync({
            type: 'function',
            id,
            command,
            function: functionArgs.func,
            permission: functionArgs.permission,
            option: functionArgs.option ?? undefined,
          });

    toast.promise(promise, {
      loading: '명령어를 수정하는 중입니다...',
      success: () => {
        onDone();
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
          <Select value={type} disabled>
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
        <DialogClose asChild>
          <Button variant="outline">취소</Button>
        </DialogClose>
        <Button type="submit">수정하기</Button>
      </DialogFooter>
      <ConfirmDialog
        open={confirmOpen}
        title="에이전트 권한을 넓힐까요?"
        description={`에이전트는 방송 제목·카테고리 변경, 시청자 채팅 제한 등 채널 설정 기능도 실행할 수 있습니다. ${PERMISSION_LABEL[functionArgs.permission]}에게 권한을 주면 이 기능들도 함께 쓸 수 있게 됩니다.${functionArgs.permission === 'VIEWER' ? ' 시청자로 설정하면 모든 채팅 참여자가 호출할 수 있습니다.' : ''} 계속할까요?`}
        confirmLabel="계속"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          submit();
        }}
      />
    </form>
  );
}
