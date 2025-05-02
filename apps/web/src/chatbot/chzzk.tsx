import { Badge } from '@/components/ui/badge';

import type { ChatbotData } from '.';

export const chzzk = {
  getChzzkTitle: {
    name: '방송 제목 조회',
    type: 'API_QUERY',
    description: <>방송 제목을 조회합니다.</>,
    descriptionShort: '방송 제목을 조회합니다.',
    usage: (command: string) => <>!{command}</>,
    usageString: (command: string) => `!${command}`,
  },
  getChzzkCategory: {
    name: '방송 카테고리 조회',
    type: 'API_QUERY',
    description: <>방송 카테고리를 조회합니다.</>,
    descriptionShort: '방송 카테고리를 조회합니다.',
    usage: (command: string) => <>!{command}</>,
    usageString: (command: string) => `!${command}`,
  },
  updateChzzkTitle: {
    name: '방송 제목 수정',
    type: 'API_CONFIG',
    description: <>방송 제목을 수정합니다.</>,
    descriptionShort: '방송 제목을 수정합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">제목</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <제목>`,
  },
  updateChzzkCategory: {
    name: '방송 카테고리 수정',
    type: 'API_CONFIG',
    description: <>방송 카테고리를 수정합니다.</>,
    descriptionShort: '방송 카테고리를 수정합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">카테고리</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <카테고리>`,
  },
  setChzzkNotice: {
    name: '방송 공지 설정',
    type: 'API_CONFIG',
    description: <>방송 공지를 설정합니다.</>,
    descriptionShort: '방송 공지를 설정합니다.',
    usage: (command: string) => (
      <>
        !{command} <Badge variant="outline">공지</Badge>
      </>
    ),
    usageString: (command: string) => `!${command} <공지>`,
  },
  getChzzkUptime: {
    name: '방송 시간 조회',
    type: 'API_QUERY',
    description: <>방송 시간을 조회합니다.</>,
    descriptionShort: '방송 시간을 조회합니다.',
    usage: (command: string) => <>!{command}</>,
    usageString: (command: string) => `!${command}`,
  },
  getChzzkViewer: {
    name: '방송 시청자 수 조회',
    type: 'API_QUERY',
    description: <>방송 시청자 수를 조회합니다.</>,
    descriptionShort: '방송 시청자 수를 조회합니다.',
    usage: (command: string) => <>!{command}</>,
    usageString: (command: string) => `!${command}`,
  },
} as ChatbotData;
