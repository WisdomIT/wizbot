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
    title: 'Echo 기능',
    description: '사전에 지정된 메시지를 표출합니다',
  },
  {
    icon: <Radio className="size-8 text-blue-500" />,
    title: '치지직 연동 기능',
    description:
      '방제 및 카테고리를 조회하거나 변경하는 등 치지직 API를 통한 관리 기능을 제공합니다',
  },
  {
    icon: <Headphones className="size-8 text-blue-500" />,
    title: '노래 신청 기능',
    description:
      '시청자가 명령어를 통해 노래를 신청하고, 방송에서 재생할 수 있습니다 (Youtube Music)',
  },
  {
    icon: <Coffee className="size-8 text-blue-500" />,
    title: '카페 대문 연동 기능',
    description: '현재 방송 상태 및 최신 유튜브 영상을 네이버 카페 대문에 연동할 수 있습니다',
  },
];

/** 도입 문의 — 랜딩의 「신청하기」와 같은 곳으로 보낸다 */
