import { useQuery } from '@tanstack/react-query';
import {
  ChatbotFunctionDefinition,
  chatbotFunctionDefinitionMap,
  ChatbotFunctionKey,
} from '@wizbot/shared/chatbot/definitions';
import { Terminal } from 'lucide-react';
import { Dispatch, SetStateAction } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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

export interface FunctionArgs {
  type: ChatbotFunctionDefinition['type'];
  func: string;
  permission: 'STREAMER' | 'MANAGER' | 'VIEWER';
  option?: string;
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
        maxLength={100}
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
  // 정의에서 선택된 타입의 function만 리스트화
  const functionList = (
    Object.entries(chatbotFunctionDefinitionMap) as [
      ChatbotFunctionKey,
      ChatbotFunctionDefinition,
    ][]
  ).filter(([, value]) => value.type === functionArgs.type);

  const selectedCommand =
    functionArgs.func in chatbotFunctionDefinitionMap
      ? chatbotFunctionDefinitionMap[functionArgs.func as ChatbotFunctionKey]
      : undefined;

  return (
    <>
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="type2" className="text-right">
          기능 분류
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
            <SelectValue placeholder="분류를 선택하세요" />
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
            {functionList.map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {functionArgs.func !== '' && selectedCommand ? (
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>{selectedCommand.name}</AlertTitle>
          <AlertDescription className="whitespace-pre-line">
            {selectedCommand.description}
          </AlertDescription>
        </Alert>
      ) : null}
      {selectedCommand?.option ? (
        <InputsFunctionOption
          functionArgs={functionArgs}
          setFunctionArgs={setFunctionArgs}
          selectedCommandKey={functionArgs.func}
        />
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

const InputsFunctionOption = ({
  functionArgs,
  setFunctionArgs,
  selectedCommandKey,
}: {
  functionArgs: FunctionArgs;
  setFunctionArgs: Dispatch<SetStateAction<FunctionArgs>>;
  selectedCommandKey: string;
}) => {
  const trpc = useTRPC();
  const spec =
    selectedCommandKey in chatbotFunctionDefinitionMap
      ? chatbotFunctionDefinitionMap[selectedCommandKey as ChatbotFunctionKey].option
      : undefined;

  // echoCommandSelect: 스트리머의 echo 명령어 목록으로 선택지를 채운다 (목록 쿼리 캐시 공유)
  const { data: commandList } = useQuery(
    trpc.command.getCommandList.queryOptions(undefined, {
      enabled: spec?.input === 'echoCommandSelect',
    }),
  );

  const optionInput =
    spec?.input === 'text'
      ? ({ type: 'text' } as const)
      : spec?.input === 'echoCommandSelect'
        ? ({
            type: 'select',
            options: (commandList?.echo ?? []).map((command) => ({
              label: command.command,
              value: command.id.toString(),
            })),
          } as const)
        : null;

  if (optionInput?.type === 'text') {
    return (
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="option" className="text-right">
          옵션
        </Label>
        <Input
          id="option"
          value={functionArgs.option}
          onChange={(event) => {
            setFunctionArgs((prev) => ({
              ...prev,
              option: event.target.value,
            }));
          }}
          className="col-span-3"
        />
      </div>
    );
  }
  if (optionInput?.type === 'select') {
    return (
      <div className="grid grid-cols-4 items-center gap-4">
        <Label htmlFor="option" className="text-right">
          옵션
        </Label>
        <Select
          value={functionArgs.option}
          onValueChange={(value) => {
            setFunctionArgs((prev) => ({
              ...prev,
              option: value,
            }));
          }}
        >
          <SelectTrigger id="option" className="col-span-3">
            <SelectValue placeholder="옵션을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {optionInput.options.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return null;
};
