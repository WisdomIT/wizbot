import { Badge } from '@/components/ui/badge';

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
} as ChatbotData;
