import { JSX } from 'react';

import type { TrpcClient } from '../utils/trpc';
import { chzzk } from './chzzk';
import { command } from './command';
import { song } from './song';

export interface ChatbotFunction {
  name: string;
  type: 'API_QUERY' | 'API_CONFIG' | 'WIZBOT_CONFIG';
  optionLabel?: string | null;
  /** 옵션 입력 UI 정의. 서버(서버 액션)에서 로그인 사용자 컨텍스트의 tRPC 클라이언트를 주입받아 호출된다 */
  optionInput?: (
    api: TrpcClient,
  ) => Promise<{ type: 'text' } | { type: 'select'; options: { key: string; value: string }[] }>;
  optionVerify?: (api: TrpcClient, option: string) => Promise<boolean>;
  description: JSX.Element;
  descriptionShort: string;
  usage: (command: string, option?: string) => JSX.Element;
  usageString: (command: string, option?: string) => string;
}

export interface ChatbotData {
  [key: string]: ChatbotFunction;
}

const chatbotData = {
  ...command,
  ...chzzk,
  ...song,
};

export default chatbotData;
