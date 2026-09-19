'use client';

import { ArrowRight, Play } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { keyboardTarget, nextIndex, PLACEHOLDER_DWELL_MS, preloadIndexes, progressRatio } from '@/lib/landing-showcase';
import { cn } from '@/lib/utils';
import { landingShowcase,type LandingShowcaseItem } from '@/src/data/wizbot';

/**
 * 「위즈봇에만 있는 것」 쇼케이스 (#277) — 좌측 탭 리스트 / 우측 그 기능을 실제로 쓰는 영상.
 * - 영상이 끝나면(ended) 다음 항목으로, 마지막이면 처음으로 순환. 항목 클릭·방향키로 즉시 전환하고 순환은 거기서 이어간다
 * - 두 <video> 를 번갈아 써 크로스페이드(250ms) — 다음 영상은 preload 로 미리 받아 검은 화면이 없다. 현재+다음만 받는다
 * - 뷰포트 밖·탭 숨김이면 멈추고(자동 전환도), 돌아오면 이어간다. prefers-reduced-motion 이면 자동 재생 대신 포스터 + 재생 버튼
 * - 영상 파일이 없거나(녹화 전) 못 불러오면 아이콘 플레이스홀더를 보여주고 일정 시간 뒤 다음으로 — 랜딩이 깨지지 않는다
 */
export default function Showcase() {
  const items = landingShowcase;
  const [index, setIndex] = useState(0);
  //  두 슬롯 중 어느 쪽이 화면에 보이는지 — 전환 때 뒤 슬롯에 다음 영상을 얹고 앞으로 올린다
  const [front, setFront] = useState<0 | 1>(0);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [userStarted, setUserStarted] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const video0 = useRef<HTMLVideoElement>(null);
  const video1 = useRef<HTMLVideoElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const current = items[index];
  const slotItems = useMemo<[LandingShowcaseItem, LandingShowcaseItem]>(() => {
    const next = items[nextIndex(index, items.length)];
    return front === 0 ? [current, next] : [next, current];
  }, [items, index, current, front]);
  const autoplay = !reduceMotion || userStarted;
  const currentFailed = !!failed[current.key];

  const goTo = useCallback((target: number) => {
    setIndex((prev) => {
      if (target === prev) return prev;
      setFront((f) => (f === 0 ? 1 : 0));
      setProgress(0);
      return target;
    });
  }, []);
  const advance = useCallback(() => goTo(nextIndex(index, items.length)), [goTo, index, items.length]);

  /* eslint-disable react-hooks/set-state-in-effect -- 매체 쿼리·뷰포트 관찰은 마운트 뒤에만 읽을 수 있다 */
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && document.visibilityState === 'visible'), { threshold: 0.25 });
    observer.observe(el);
    const onVisibility = () => setVisible(document.visibilityState === 'visible' && el.getBoundingClientRect().bottom > 0);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  //  앞 슬롯은 재생, 뒤 슬롯은 처음으로 되감아 대기. 보이지 않으면 둘 다 멈춤
  useEffect(() => {
    const frontVideo = (front === 0 ? video0 : video1).current;
    const backVideo = (front === 0 ? video1 : video0).current;
    if (backVideo) {
      backVideo.pause();
      try { backVideo.currentTime = 0; } catch { /* 아직 메타데이터 전 */ }
    }
    if (!frontVideo) return;
    if (visible && autoplay && !currentFailed) {
      frontVideo.currentTime = 0;
      void frontVideo.play().catch(() => null);
    } else {
      frontVideo.pause();
    }
  }, [front, index, visible, autoplay, currentFailed]);

  //  영상이 없을 때의 자동 전환 — 플레이스홀더를 잠깐 보여주고 넘어간다
  useEffect(() => {
    if (!currentFailed || !visible || !autoplay) return;
    const timer = setTimeout(advance, PLACEHOLDER_DWELL_MS);
    return () => clearTimeout(timer);
  }, [currentFailed, visible, autoplay, advance]);

  const preload = preloadIndexes(index, items.length).map((i) => items[i].key);

  return (
    <section id="benefits" ref={sectionRef} className="container py-24 sm:py-32 mx-auto px-4 md:px-0">
      <div className="mb-10 lg:mb-14">
        <h2 className="md:text-lg text-blue-500 mb-2 tracking-wider font-black">Showcase</h2>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">위즈봇에만 있는 것</h2>
        <p className="md:text-xl text-muted-foreground">기능을 나열하는 대신, 실제로 어떻게 쓰이는지 보여드립니다.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-12">
        {/* 영상 — 모바일은 위 */}
        <div
          role="tabpanel"
          id={`showcase-panel-${current.key}`}
          aria-labelledby={`showcase-tab-${current.key}`}
          className="relative order-1 aspect-video overflow-hidden rounded-xl border bg-muted shadow-lg lg:order-2"
        >
          {slotItems.map((item, slot) => (
            <video
              key={`${slot}-${item.key}`}
              ref={slot === 0 ? video0 : video1}
              className={cn('absolute inset-0 size-full object-cover transition-opacity duration-300', slot === front ? 'opacity-100' : 'opacity-0')}
              muted
              playsInline
              preload={preload.includes(item.key) ? 'auto' : 'none'}
              poster={item.video.poster}
              aria-hidden={slot !== front}
              onTimeUpdate={(event) => {
                if (slot !== front) return;
                const video = event.currentTarget;
                setProgress(progressRatio(video.currentTime, video.duration));
              }}
              onEnded={() => {
                if (slot === front) advance();
              }}
              onError={() => setFailed((prev) => (prev[item.key] ? prev : { ...prev, [item.key]: true }))}
            >
              <source src={item.video.webm} type="video/webm" />
              <source src={item.video.mp4} type="video/mp4" />
            </video>
          ))}

          {/* 녹화 전·로드 실패 — 아이콘 플레이스홀더 */}
          {currentFailed && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-cyan-500/15 via-background to-blue-600/20 text-muted-foreground">
              <span className="rounded-full border bg-background/80 p-4 text-blue-500 [&>svg]:size-8">{current.icon}</span>
              <span className="text-sm font-semibold">{current.title}</span>
            </div>
          )}

          {/* 모션 최소화 — 자동 재생 대신 재생 버튼 */}
          {reduceMotion && !userStarted && !currentFailed && (
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center bg-background/40"
              aria-label="영상 재생"
              onClick={() => setUserStarted(true)}
            >
              <span className="rounded-full bg-background/90 p-4 shadow"><Play className="size-8" /></span>
            </button>
          )}
        </div>

        {/* 리스트 — 모바일은 아래 */}
        <div role="tablist" aria-label="위즈봇 기능" aria-orientation="vertical" className="order-2 flex flex-col gap-2 lg:order-1">
          {items.map((item, i) => {
            const active = i === index;
            return (
              <button
                key={item.key}
                ref={(el) => { tabRefs.current[i] = el; }}
                type="button"
                role="tab"
                id={`showcase-tab-${item.key}`}
                aria-selected={active}
                aria-controls={`showcase-panel-${item.key}`}
                tabIndex={active ? 0 : -1}
                className={cn(
                  'relative overflow-hidden rounded-lg border px-4 py-3 text-left transition-colors',
                  active ? 'border-blue-500/50 bg-muted/60' : 'hover:bg-muted/40',
                )}
                onClick={() => goTo(i)}
                onKeyDown={(event) => {
                  const target = keyboardTarget(event.key, index, items.length);
                  if (target === null) return;
                  event.preventDefault();
                  goTo(target);
                  tabRefs.current[target]?.focus();
                }}
              >
                <div className="flex items-center gap-3">
                  <span className={cn('shrink-0', active ? 'text-blue-500' : 'text-muted-foreground')}>{item.icon}</span>
                  <span className="font-bold">{item.title}</span>
                </div>
                {/* 활성 항목만 설명 펼침 — 높이 트랜지션 */}
                <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', active ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="overflow-hidden">
                    <p className="pt-2 text-sm text-muted-foreground">{item.description}</p>
                    {item.manualHref && (
                      <Link href={item.manualHref} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:underline" onClick={(event) => event.stopPropagation()}>
                        자세히 <ArrowRight className="size-3" />
                      </Link>
                    )}
                  </div>
                </div>
                {/* 영상 진행률 */}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-500/20" aria-hidden>
                    <span className="block h-full bg-blue-500 transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
