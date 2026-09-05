import { BotMessageSquare, Coffee, Headphones, Radio } from 'lucide-react';
import { JSX } from 'react';

/** 랜딩과 시청자용 사이트 정보 페이지가 함께 쓰는 서비스 소개 문구 */

export interface WizbotFunction {
  icon: JSX.Element;
  title: string;
  description: string;
}

export const functionsList: WizbotFunction[] = [
  {
    icon: <BotMessageSquare className="size-8 text-blue-500" />,
    title: '채팅 명령어',
    description: '시청자가 명령어를 입력하면 봇이 정해둔 메시지로 답합니다',
  },
  {
    icon: <Radio className="size-8 text-blue-500" />,
    title: '치지직 연동',
    description: '채팅 명령어로 방송 제목과 카테고리를 확인하거나 바꿀 수 있습니다',
  },
  {
    icon: <Headphones className="size-8 text-blue-500" />,
    title: '노래 신청',
    description: '시청자가 채팅으로 신청한 유튜브 노래를 방송에서 이어서 재생합니다',
  },
  {
    icon: <Coffee className="size-8 text-blue-500" />,
    title: '카페 대문 연동',
    description: '방송 상태와 최신 유튜브 영상을 네이버 카페 대문에 자동으로 반영합니다',
  },
];

/** 도입 문의 — 랜딩의 「신청하기」와 같은 곳으로 보낸다 */
