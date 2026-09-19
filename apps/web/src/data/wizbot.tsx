import { BotMessageSquare, Coffee, Headphones, History, Palette, Radio, Sparkles } from 'lucide-react';
import { JSX } from 'react';

/** 시청자용 사이트 정보 페이지(/[channelId]/info)의 서비스 소개 — 시청자에게 의미 있는 4개만 */

export interface WizbotFunction {
  icon: JSX.Element;
  title: string;
  description: string;
}

/**
 * 랜딩 쇼케이스 (#277) — 위즈봇에만 있는 것. 우측에는 영상이 아니라 **실제 UI 를 모사한 데모**가 돈다
 * (app/_components/showcase/demo-*.tsx). 채팅 명령어가 첫 항목 — 시청자가 가장 먼저 만나는 장면이다
 */
export type LandingDemoKey = 'chat' | 'agent' | 'music' | 'cafe' | 'viewer-page' | 'audit';

export interface LandingShowcaseItem {
  key: LandingDemoKey;
  icon: JSX.Element;
  title: string;
  description: string;
  /** 자동 순환에서 이 항목에 머무는 시간(ms) — 데모 대본 길이에 맞춘다 */
  dwellMs: number;
  manualHref?: string;
}

export const landingShowcase: LandingShowcaseItem[] = [
  {
    key: 'chat',
    icon: <BotMessageSquare className="size-5" />,
    title: '채팅 명령어·반복 메시지',
    description: '시청자·매니저·스트리머 권한을 나누고, 채팅에서 바로 추가·수정합니다. 노래 신청과 방송 제목 변경도 채팅 한 줄로.',
    dwellMs: 22_000,
    manualHref: '/manual/chatbot-commands',
  },
  {
    key: 'agent',
    icon: <Sparkles className="size-5" />,
    title: '에이전트',
    description: '「!디스코드 명령어 만들어줘」라고 말하면 끝. 콘솔과 방송 채팅 어디서든 위즈봇이 대신 설정합니다.',
    dwellMs: 16_000,
    manualHref: '/manual/agent',
  },
  {
    key: 'music',
    icon: <Headphones className="size-5" />,
    title: '뮤직 플레이어',
    description: '시청자 신청·자동 재생·즐겨찾기. 데스크톱 앱이면 전역 단축키로 조작하고, 유튜브 프리미엄이면 광고 없이. 직접 눌러보세요.',
    dwellMs: 14_000,
    manualHref: '/manual/music-player',
  },
  {
    key: 'cafe',
    icon: <Coffee className="size-5" />,
    title: '카페 대문 자동화',
    description: '방송을 켜고 끌 때마다 네이버 카페 대문의 이미지와 최신 영상을 위즈봇이 갱신합니다.',
    dwellMs: 14_000,
    manualHref: '/manual/cafe-integration',
  },
  {
    key: 'viewer-page',
    icon: <Palette className="size-5" />,
    title: '시청자 페이지',
    description: '내 채널 색과 글꼴로 꾸민 명령어 목록·실시간 플레이리스트·재생 기록을 시청자에게. 색과 글꼴을 골라보세요.',
    dwellMs: 14_000,
    manualHref: '/manual/viewer-page',
  },
  {
    key: 'audit',
    icon: <History className="size-5" />,
    title: '변경 기록',
    description: '누가 언제 무엇을 바꿨는지 전부 남습니다 — 매니저와 에이전트에게 안심하고 맡길 수 있습니다.',
    dwellMs: 12_000,
    manualHref: '/manual/settings',
  },
];

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
