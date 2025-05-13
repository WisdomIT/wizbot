import { Terminal } from 'lucide-react';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';

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
import { ChatbotFunction } from '@/src/chatbot';
import chatbotData from '@/src/chatbot';

import { getFunctionOption } from '../_api/command';

export interface FunctionArgs {
  type: ChatbotFunction['type'];
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
      {selectedCommand?.optionInput ? (
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
  const [optionInput, setOptionInput] = useState<
    { type: 'text' } | { type: 'select'; options: { key: string; value: string }[] } | null
  >(null);

  useEffect(() => {
    async function fetchOptionInput() {
      const request = await getFunctionOption(selectedCommandKey);

      if (request) {
        setOptionInput(request);
      } else {
        setOptionInput(null);
      }
    }

    void fetchOptionInput();
  }, [selectedCommandKey]);

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
              <SelectItem key={item.key} value={item.value}>
                {item.key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return null;
};
