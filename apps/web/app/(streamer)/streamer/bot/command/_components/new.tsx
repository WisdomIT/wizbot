import { Terminal } from 'lucide-react';
import { Dispatch, SetStateAction, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { ChatbotFunction } from '@/src/chatbot';
import chatbotData from '@/src/chatbot';

import { CreateCommand, createCommand } from '../_api/command';

export interface FunctionArgs {
  type: ChatbotFunction['type'];
  func: string;
  permission: 'STREAMER' | 'MANAGER' | 'VIEWER';
  option?: string;
}

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

export function InputsEcho({
  echo,
  setEcho,
}: {
  echo: string;
  setEcho: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="grid grid-cols-4 items-center gap-4">
      <Label htmlFor="echo" className="text-right">
        응답
      </Label>
      <Input
        id="echo"
        value={echo}
        onChange={(event) => {
          setEcho(event.target.value);
        }}
        className="col-span-3"
      />
    </div>
  );
}

export function InputsFunction({
  functionArgs,
  setFunctionArgs,
}: {
  functionArgs: FunctionArgs;
  setFunctionArgs: Dispatch<SetStateAction<FunctionArgs>>;
}) {
  //chatbotData에서 type2와 일치하는 type의 function만 리스트화함
  const functionList = Object.entries(chatbotData).reduce((acc, [key, value]) => {
    if (value.type === functionArgs.type) {
      acc.push({ key, value });
    }
    return acc;
  }, [] as { key: string; value: ChatbotFunction }[]);

  const selectedCommand = chatbotData[functionArgs.func];

  return (
    <>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="type2" className="text-right">
          타입2
        </Label>
        <Select
          value={functionArgs.type}
          onValueChange={(value) => {
            setFunctionArgs((prev) => ({
              ...prev,
              type: value as FunctionArgs['type'],
              func: '',
            }));
          }}
        >
          <SelectTrigger id="type2" className="col-span-3">
            <SelectValue placeholder="Function 타입을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="API_QUERY">치지직 조회</SelectItem>
            <SelectItem value="API_CONFIG">치지직 설정</SelectItem>
            <SelectItem value="WIZBOT_CONFIG">위즈봇</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="functionName" className="text-right">
          기능
        </Label>
        <Select
          value={functionArgs.func}
          onValueChange={(value) => {
            setFunctionArgs((prev) => ({
              ...prev,
              func: value,
            }));
          }}
        >
          <SelectTrigger id="functionName" className="col-span-3">
            <SelectValue placeholder="기능을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {functionList.map((item) => (
              <SelectItem key={item.key} value={item.key}>
                {item.value.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {functionArgs.func !== '' && selectedCommand ? (
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>{chatbotData[functionArgs.func].name}</AlertTitle>
          <AlertDescription>{chatbotData[functionArgs.func].description}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="permission" className="text-right">
          권한
        </Label>
        <Select
          value={functionArgs.permission}
          onValueChange={(value) => {
            setFunctionArgs((prev) => ({
              ...prev,
              permission: value as FunctionArgs['permission'],
            }));
          }}
        >
          <SelectTrigger id="type2" className="col-span-3">
            <SelectValue placeholder="권한을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="STREAMER">스트리머</SelectItem>
            <SelectItem value="MANAGER">매니저</SelectItem>
            <SelectItem value="VIEWER">시청자</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
