'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { keyboardTarget, nextIndex, progressRatio, TICK_MS } from '@/lib/landing-showcase';
import { cn } from '@/lib/utils';
import { type LandingDemoKey, landingShowcase } from '@/src/data/wizbot';

import { DemoAgent } from './demo-agent';
import { DemoAudit } from './demo-audit';
import { DemoCafe } from './demo-cafe';
import { DemoChat } from './demo-chat';
import { DemoMusic } from './demo-music';
import { DemoViewerPage } from './demo-viewer-page';

/**
 * 「위즈봇에만 있는 것」 쇼케이스 (#277) — 좌측 탭 리스트 / 우측 그 기능의 **실제 UI 를 모사한 데모**.
 * - 항목마다 dwellMs 동안 머물고 다음으로 순환(진행 바). 항목 클릭·방향키로 즉시 전환하고 순환은 거기서 이어간다
 * - 데모 위에 마우스를 올리거나(조작 중) 포커스가 있으면 순환을 멈춘다 — 뮤직 플레이어·시청자 페이지·카페는 직접 조작할 수 있다
 * - 뷰포트 밖·탭 숨김이면 멈추고 돌아오면 이어간다. prefers-reduced-motion 이면 자동 순환을 끈다(수동 전환만)
 * - 전환은 200ms 페이드. 데모는 active 를 받아 자기 대본을 돌린다
 */
export default function Showcase() {
  const items = landingShowcase;
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [visible, setVisible] = useState(true);
  const [hovering, setHovering] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [fading, setFading] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items[index];

  const goTo = useCallback((target: number) => {
    setFading(true);
    setTimeout(() => {
      setIndex(target);
      setElapsed(0);
      setFading(false);
    }, 200);
  }, []);

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

  //  자동 순환 타이머 — 보이고, 조작 중이 아니고, 모션 최소화가 아닐 때만 흐른다
  const running = visible && !hovering && !reduceMotion && !fading;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setElapsed((e) => {
        const next = e + TICK_MS;
        if (next >= current.dwellMs) {
          goTo(nextIndex(index, items.length));
          return e;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [running, current.dwellMs, index, items.length, goTo]);

  const progress = progressRatio(elapsed, current.dwellMs);

  return (
    <section id="benefits" ref={sectionRef} className="container py-24 sm:py-32 mx-auto px-4 md:px-0">
      <div className="mb-10 lg:mb-14">
        <h2 className="md:text-lg text-blue-500 mb-2 tracking-wider font-black">Showcase</h2>
        <h2 className="text-3xl md:text-4xl font-bold mb-4">위즈봇은 이렇게 쓰입니다</h2>
        <p className="md:text-xl text-muted-foreground">채팅에서, 콘솔에서, 방송 화면에서 — 실제 화면 그대로 직접 만져보세요.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:gap-12">
        {/* 데모 — 모바일은 위 */}
        <div
          role="tabpanel"
          id={`showcase-panel-${current.key}`}
          aria-labelledby={`showcase-tab-${current.key}`}
          className={cn('order-1 h-[26rem] overflow-hidden rounded-xl border bg-muted shadow-lg transition-opacity duration-200 lg:order-2 lg:h-[30rem]', fading ? 'opacity-0' : 'opacity-100')}
          onPointerEnter={() => setHovering(true)}
          onPointerLeave={() => setHovering(false)}
          onFocusCapture={() => setHovering(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHovering(false);
          }}
        >
          <Demo demoKey={current.key} active={visible && !fading} />
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
                onClick={() => { if (!active) goTo(i); }}
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
                {/* 자동 순환 진행률 — 조작 중이면 멈춘 채로 */}
                {active && !reduceMotion && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-500/20" aria-hidden>
                    <span className="block h-full bg-blue-500" style={{ width: `${Math.round(progress * 100)}%`, transition: `width ${TICK_MS}ms linear` }} />
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

function Demo({ demoKey, active }: { demoKey: LandingDemoKey; active: boolean }) {
  switch (demoKey) {
    case 'chat': return <DemoChat active={active} />;
    case 'agent': return <DemoAgent active={active} />;
    case 'music': return <DemoMusic />;
    case 'cafe': return <DemoCafe active={active} />;
    case 'viewer-page': return <DemoViewerPage />;
    case 'audit': return <DemoAudit active={active} />;
  }
}
