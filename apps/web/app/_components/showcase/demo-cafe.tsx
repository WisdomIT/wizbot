'use client';

import { Eye, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * 카페 대문 자동화 데모 (#277) — 네이버 카페 대문 프레임 안에 위즈봇이 그려 넣는 이미지를 모사한다.
 * 방송 중: 썸네일·제목·카테고리·시청자 수. 방송 종료: 「방송이 끝났습니다」. 버튼으로 바꾸거나 몇 초마다 자동으로 바뀐다
 */
const LIVE = { title: '신작 게임 엔딩까지 달립니다 🎮 시청자 추천 곡도 받아요', category: '리그 오브 레전드', viewers: 1234, startedAt: '20:30' };

export function DemoCafe({ active }: { active: boolean }) {
  const [live, setLive] = useState(true);
  const [flash, setFlash] = useState(false);

  //  자동 전환 — 위즈봇이 방송 상태를 보고 대문을 갱신하는 것처럼
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setLive((v) => !v), 6000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 상태 전환 순간의 깜빡임 표시
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 900);
    return () => clearTimeout(timer);
  }, [live]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f5f6f7] text-[#222]">
      {/* 카페 상단 — 네이버 카페 느낌 */}
      <div className="flex h-9 shrink-0 items-center gap-2 bg-[#03c75a] px-3 text-xs font-bold text-white">
        <span className="rounded bg-white/20 px-1.5 py-0.5">cafe</span> 뫄사카 · 스트리머 팬카페
        <span className="ml-auto flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
          <span className={cn('size-1.5 rounded-full', flash ? 'bg-yellow-300' : 'bg-white')} /> 위즈봇이 대문을 갱신함
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <aside className="hidden w-28 shrink-0 flex-col gap-1.5 text-[11px] sm:flex">
          {['카페 정보', '전체글보기', '공지사항', '자유게시판', '팬아트', '방송 일정'].map((m, i) => (
            <span key={m} className={cn('rounded px-2 py-1', i === 0 ? 'bg-white font-semibold text-[#03c75a]' : 'text-[#555]')}>{m}</span>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="text-[11px] font-semibold text-[#555]">카페 대문</div>
          {/* 위즈봇이 그려 넣는 이미지 (836px 폭 상당) */}
          <div className={cn('relative aspect-[836/300] w-full overflow-hidden rounded-md shadow transition-all duration-500', flash && 'ring-2 ring-[#03c75a]')}>
            {live ? (
              <div className="flex size-full items-stretch bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white">
                <div className="relative w-[45%] shrink-0 bg-[radial-gradient(circle_at_30%_30%,#38bdf8_0,#1e3a8a_60%,#0f172a_100%)]">
                  <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black"><Radio className="size-3" /> LIVE</span>
                  <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold"><Eye className="size-3" /> {LIVE.viewers.toLocaleString('ko-KR')}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 p-3 sm:p-4">
                  <span className="text-[10px] font-semibold text-emerald-300">지금 방송 중 · {LIVE.startedAt} 시작</span>
                  <span className="line-clamp-2 text-sm font-black leading-snug sm:text-base">{LIVE.title}</span>
                  <span className="text-[11px] text-slate-300">{LIVE.category}</span>
                  <span className="mt-1 inline-flex w-fit items-center rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-900">치지직에서 보기 →</span>
                </div>
              </div>
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-zinc-100 to-zinc-300 text-zinc-700">
                <span className="text-base font-black sm:text-lg">방송이 끝났습니다</span>
                <span className="text-[11px]">다음 방송을 기다려주세요 · 최근 방송 {LIVE.startedAt}</span>
                <span className="mt-1 inline-flex items-center rounded border border-zinc-500 px-2 py-0.5 text-[10px] font-semibold">최신 영상 보러가기 →</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[#555]">
            <span>방송 상태:</span>
            <button type="button" className={cn('rounded-full border px-2.5 py-0.5 font-semibold transition-colors', live ? 'border-red-500 bg-red-500 text-white' : 'bg-white hover:bg-zinc-100')} onClick={() => setLive(true)}>방송 중</button>
            <button type="button" className={cn('rounded-full border px-2.5 py-0.5 font-semibold transition-colors', !live ? 'border-zinc-700 bg-zinc-700 text-white' : 'bg-white hover:bg-zinc-100')} onClick={() => setLive(false)}>방송 종료</button>
            <span className="ml-auto hidden sm:inline">방송을 켜고 끌 때마다 위즈봇이 자동으로 바꿔 넣습니다</span>
          </div>
        </div>
      </div>
    </div>
  );
}
