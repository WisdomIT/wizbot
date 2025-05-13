import { Badge } from '@/components/ui/badge';

import { trpc } from '../utils/trpc';
import type { ChatbotData } from '.';

export const command = {
  createCommandEcho: {
    name: 'echo 명령어 추가',
    type: 'WIZBOT_CONFIG',
    description: <>특정 메시지로 응답하는 echo 명령어를 추가합니다.</>,
    descriptionShort: '특정 메시지로 응답하는 명령어를 추가합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">명령어 이름</Badge>{' '}
        <Badge variant="outline">응답</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <명령어 이름> <응답>`,
  },
  deleteCommandEcho: {
    name: 'echo 명령어 삭제',
    type: 'WIZBOT_CONFIG',
    description: <>특정 메시지로 응답하는 echo 명령어를 삭제합니다.</>,
    descriptionShort: '특정 메시지로 응답하는 명령어를 삭제합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">명령어 이름</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <명령어 이름>`,
  },
  updateCommandEcho: {
    name: 'echo 명령어 수정',
    type: 'WIZBOT_CONFIG',
    description: <>특정 메시지로 응답하는 echo 명령어를 수정합니다.</>,
    descriptionShort: '특정 메시지로 응답하는 명령어를 수정합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">명령어 이름</Badge>{' '}
        <Badge variant="outline">응답</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <명령어 이름> <응답>`,
  },
  updateSpecificCommandEcho: {
    name: 'echo 명령어 수정 (지정)',
    type: 'WIZBOT_CONFIG',
    description: (
      <>
        특정 echo 명령어를 수정합니다.
        <br />
        <br />
        <span>
          <Badge variant="secondary" className="inline">
            !멤버 수정
          </Badge>
          {` `}과 같이 특정 명령어를 시청자가 수정할 수 있도록
          {` `}
          하는 데 사용하기 좋습니다.
        </span>
      </>
    ),
    descriptionShort: '특정 echo 명령어를 수정합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">응답</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <응답>`,
    optionLabel: 'echo 명령어',
    optionInput: async (userId: number) => {
      const response = await trpc.command.getCommandList.query({
        userId,
      });

      const echoCommands = response.echo;

      return {
        type: 'select',
        options: echoCommands.map((command) => ({
          key: command.command,
          value: command.id.toString(),
        })),
      };
    },
    optionVerify: async (userId: number, option: string) => {
      const response = await trpc.command.getCommandList.query({
        userId,
      });

      const echoCommands = response.echo;

      return echoCommands.some((command) => command.id.toString() === option);
    },
  },
  createChatbotRepeat: {
    name: '반복 명령어 추가',
    type: 'WIZBOT_CONFIG',
    description: (
      <>
        특정 메시지를 반복하는 명령어를 추가합니다.
        <br />
        <br />
        반복 주기는 {`'반복'`}메뉴의 기본 주기로 자동 설정됩니다.
      </>
    ),
    descriptionShort: '특정 메시지를 반복하는 명령어를 추가합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">반복 메시지</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <반복 메시지>`,
  },
  deleteChatbotRepeat: {
    name: '반복 명령어 삭제',
    type: 'WIZBOT_CONFIG',
    description: (
      <>
        특정 메시지를 반복하는 명령어를 삭제합니다.
        <br />
        <br />
        옵션으로 삭제할 반복 메시지의 id 혹은 {`"all"`}을 입력하세요.
      </>
    ),
    descriptionShort: '특정 메시지를 반복하는 명령어를 삭제합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">반복메시지 id</Badge> or{' '}
        <Badge variant="outline">all</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <id> or all`,
  },
} as ChatbotData;
