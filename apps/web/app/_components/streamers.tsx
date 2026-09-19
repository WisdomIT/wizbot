import Link from 'next/link';
import { Suspense, use } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { getStreamers } from '../_lib/streamers';

/** 랜딩에는 팔로워 많은 순으로 (#271). 썸네일이 작아진 만큼 #277 에서 16명으로 — 전체는 /list */
const LANDING_LIMIT = 16;

/**
 * 위즈봇을 사용중인 스트리머 (#277) — 원형 썸네일만 나열한다. 카드(정사각 프로필 + 이름 + 링크 아이콘)는 화면을 너무 차지했고,
 * 스트리머가 등록한 링크는 시청자 페이지 사이드바에 이미 있어 랜딩에서는 뺀다. 클릭하면 그 스트리머의 시청자 페이지(명령어)로
 */
export default function Streamers() {
  const [streamerList, all] = use(Promise.all([getStreamers(LANDING_LIMIT), getStreamers()]));
  const more = Math.max(0, all.length - streamerList.length);

  return (
    <section id="team" className="container lg:w-[75%] py-24 sm:py-32 mx-auto px-4 md:px-0">
      <div className="md:text-center mb-8">
        <h2 className="md:text-lg text-blue-500 mb-2 tracking-wider font-black">Streamers</h2>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">위즈봇을 사용중인 스트리머</h2>
      </div>
      <Suspense fallback={<div className="text-center">Loading...</div>}>
        <ul className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
          {streamerList.map((streamer) => (
            <li key={streamer.channelId}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/${streamer.channelId}/command`}
                    aria-label={`${streamer.channelName} 시청자 페이지`}
                    className="group block rounded-full ring-2 ring-transparent transition-all hover:scale-110 hover:ring-blue-500 focus-visible:ring-blue-500 focus-visible:outline-none"
                  >
                    <Avatar className="size-12 md:size-16">
                      <AvatarImage src={streamer.channelImageUrl || undefined} alt="" className="object-cover" />
                      <AvatarFallback className="text-sm font-bold">{streamer.channelName.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>{streamer.channelName}</TooltipContent>
              </Tooltip>
            </li>
          ))}
          {more > 0 && (
            <li>
              <Link
                href="/list"
                className="flex h-12 items-center rounded-full border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:h-16"
              >
                +{more} · 전체 보기
              </Link>
            </li>
          )}
        </ul>
      </Suspense>
    </section>
  );
}
