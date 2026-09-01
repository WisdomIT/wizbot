'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BotMessageSquare, Download, FileAudio2, History, Image as ImageIcon, Link, ListPlus, Megaphone, MessageCircleQuestion, Play, Radio, SquareChevronRight, User, Youtube } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
} from '@/components/ui/sidebar';
import { useTRPC } from '@/src/utils/trpc-react';

import { AgentPanel } from './agent/agent-panel';
import BodyBreadcrumb from './body-breadcrumb';
import { NavMenu } from './nav-menu';
import { NavTitle } from './nav-title';
import { NavUser } from './nav-user';
import { StreamerPlayerBar } from './song/streamer-player-bar';

const group = {
  bot: '봇',
  song: '노래',
  cafe: '카페 대문 연동',
  setting: '설정',
  news: '소식',
};

const title = {
  title: '위즈봇',
  description: '스트리머 콘솔',
  avatar: '/images/wisdomit.png',
  href: '/streamer',
};

const data = {
  bot: [
    {
      name: '명령어',
      url: '/streamer/bot/command',
      icon: <SquareChevronRight />,
    },
    {
      name: '반복',
      url: '/streamer/bot/repeat',
      icon: <BotMessageSquare />,
    },
  ],
  song: [
    {
      name: '뮤직플레이어',
      url: '/streamer/song/player',
      icon: <Play />,
    },
    {
      name: '즐겨찾기',
      url: '/streamer/song/favorite',
      icon: <ListPlus />,
    },
    {
      name: '재생 기록',
      url: '/streamer/song/history',
      icon: <FileAudio2 />,
    },
    {
      //  설치 경로가 노래 설정 모달 안에만 있어 찾기 어려웠다 — 메뉴에서 바로 (#117)
      name: '플레이어 앱 설치',
      url: '/download',
      icon: <Download />,
      popup: true,
    },
  ],
  cafe: [
    {
      name: '연동 설정',
      url: '/streamer/cafe/setting',
      icon: <Radio />,
    },
    {
      name: '대문 이미지',
      url: '/streamer/cafe/editor',
      icon: <ImageIcon />,
    },
    {
      name: '유튜브 채널',
      url: '/streamer/cafe/youtube',
      icon: <Youtube />,
    },
  ],
  setting: [
    {
      name: '계정 설정',
      url: '/streamer/user/setting',
      icon: <User />,
    },
    {
      name: '링크 설정',
      url: '/streamer/user/link',
      icon: <Link />,
    },
    {
      name: '변경 기록',
      url: '/streamer/user/audit',
      icon: <History />,
    },
  ],
  news: [
    {
      name: '공지사항',
      url: '/streamer/notice',
      icon: <Megaphone />,
    },
    {
      name: '문의사항',
      url: '/streamer/inquiry',
      icon: <MessageCircleQuestion />,
    },
  ],
};

interface AppSidebarStreamerProps extends React.ComponentProps<typeof Sidebar> {
  children: React.ReactNode;
  /** 레이아웃(RSC)에서 조회해 내려주는 로그인 스트리머 정보 (#22) */
  user: { nickname: string; id: string; avatar: string };
  /** 메뉴 경로 접두어. 어드민 대행(#71)은 /admin/streamers/{id} 로 같은 메뉴를 미러링한다 */
  basePath?: string;
  /** 대행 중일 때 사이드바 상단의 나가기 링크 */
  exitHref?: string;
}

/** 메뉴 정의는 /streamer 기준 — 접두어만 바꿔 대행 콘솔에서도 같은 메뉴를 쓴다 */
function withBase(items: { name: string; url: string; icon: React.JSX.Element; popup?: boolean }[], basePath: string) {
  return items.map((item) => ({ ...item, url: item.url.replace(/^\/streamer/, basePath) }));
}

export default function AppSidebarStreamer({ children, user, basePath = '/streamer', exitHref, ...props }: AppSidebarStreamerProps) {
  const pathname = usePathname();
  //  어드민 대행(#71)에서는 어드민 사이드바 안쪽에 중첩된다 (아래 collapsible="none" 주석 참고)
  const nested = !!exitHref;
  //  안 읽은 공지·답변 — 사이드바 점 표시 (#206). 각 목록/스레드를 열면 해당 쿼리가 무효화된다
  const trpc = useTRPC();
  const { data: unread } = useQuery(trpc.notice.unread.queryOptions());
  const hasUnread = (unread?.count ?? 0) > 0;
  const { data: inquiryUnread } = useQuery(trpc.inquiry.unread.queryOptions());
  const hasInquiryUnread = (inquiryUnread?.count ?? 0) > 0;
  const menus = {
    bot: withBase(data.bot, basePath),
    song: withBase(data.song, basePath),
    cafe: withBase(data.cafe, basePath),
    setting: withBase(data.setting, basePath),
    //  대행 콘솔(#71)에는 공지 미러가 없다 — 공개 페이지를 새 창으로
    //  대행 콘솔(#71): 공지는 공개 페이지 새 창, 문의는 어드민 자신의 화면(/admin/inquiries)이 있어 뺀다
    news: nested
      ? [{ ...data.news[0], url: '/notice', popup: true, dot: hasUnread }]
      : [
          { ...data.news[0], dot: hasUnread },
          { ...data.news[1], dot: hasInquiryUnread },
        ],
  };

  // 경로에 해당하는 item과 group 찾기
  let currentGroup: string | undefined = undefined;
  let currentPage: string | undefined = undefined;

  for (const [key, items] of Object.entries(menus)) {
    //  상세 경로(/streamer/notice/3 등)도 해당 메뉴로 — 경계('/')를 지켜 접두어 매칭 (#206)
    const found = items.find((item) => pathname === item.url || pathname.startsWith(`${item.url}/`));
    if (found) {
      currentGroup = group[key as keyof typeof group];
      currentPage = found.name;
      break;
    }
  }

  //  기본 Sidebar 는 position:fixed 로 화면 왼쪽에 그려져 바깥 사이드바와 겹치므로, 중첩(nested)일 때는
  //  흐름 안에 그리는 collapsible="none" 으로 (shadcn 의 중첩 사이드바 방식). 높이는 화면에 묶고(sticky,
  //  바깥 inset 여백 0.5rem×2 를 뺀 100svh) — 부모가 넘치지 않으면서 내용만 스크롤되고,
  //  메뉴가 길면 SidebarContent(overflow-auto) 안에서 자체 스크롤된다
  return (
    <>
      <Sidebar
        variant="inset"
        collapsible={nested ? 'none' : undefined}
        className={nested ? 'sticky top-2 h-[calc(100svh-1rem)] shrink-0 self-start border-r' : undefined}
        {...props}
      >
        <SidebarHeader>
          <NavTitle data={{ ...title, href: basePath, description: exitHref ? `${user.nickname} 의 콘솔 (대행)` : title.description }} />
          {exitHref && (
            // next/link 프리페치가 exit 라우트(쿠키 삭제)를 미리 호출하지 않도록 일반 앵커
            <a href={exitHref} className="mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <ArrowLeft className="size-4" /> 스트리머 목록으로
            </a>
          )}
        </SidebarHeader>
        <SidebarContent>
          <NavMenu title="봇" items={menus.bot} pathname={pathname} />
          <NavMenu title="노래" items={menus.song} pathname={pathname} />
          <NavMenu title="카페 대문 연동" items={menus.cafe} pathname={pathname} />
          <NavMenu title="설정" items={menus.setting} pathname={pathname} />
          <NavMenu title="소식" items={menus.news} pathname={pathname} />
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={user} viewerUrl={`/${user.id}/command`} hideLogout={nested} />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className={nested ? 'min-h-0' : undefined}>
        <BodyBreadcrumb group={currentGroup ?? ''} page={currentPage ?? ''}>
          {children}
        </BodyBreadcrumb>
        <StreamerPlayerBar />
        {/* 설정 도우미 (#35) — 어드민에서 켰을 때만 뜬다 */}
        <AgentPanel />
      </SidebarInset>
    </>
  );
}
