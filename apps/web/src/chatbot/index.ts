import { JSX } from 'react';

import { chzzk } from './chzzk';
import { command } from './command';
import { song } from './song';

export interface ChatbotFunction {
  name: string;
  type: 'API_QUERY' | 'API_CONFIG' | 'WIZBOT_CONFIG';
  optionLabel?: string | null;
  optionInput?: (
    userId: number,
  ) => Promise<{ type: 'text' } | { type: 'select'; options: { key: string; value: string }[] }>;
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
