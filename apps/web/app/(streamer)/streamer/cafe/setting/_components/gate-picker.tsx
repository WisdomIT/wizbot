'use client';

import { type GateBox, type GatePick, type GatePicks } from '@wizbot/shared/lib/cafeGate';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Target = 'image' | 'youtube';
export type GateRender = { png: string; width: number; height: number; boxes: GateBox[] };

const LABEL: Record<Target, string> = { image: '방송 상태 이미지', youtube: '유튜브 영상' };

/**
 * 워커가 네이버 대문 폭(836px)으로 렌더한 스크린샷 위에 요소별 투명 클릭 영역을 얹어 자리를 고른다 (#9).
 * 콘솔에서 HTML 을 직접 렌더하면 카페 이미지가 Referer 검사로 403 이 나고 폭·CSS 도 네이버와 달라서 워커가 그린다.
 * - 요소 클릭 → 그 자리에 블록(같은 요소 재클릭으로 해제). 자리 선택은 저장되고, 설정(배경·채널)이 끝나야 반영된다
 * - 이미 들어 있는 블록(초록)은 클릭하면 「뺌」으로 표시된다
 * - 둘 다 선택 사항. 고르지 않으면 아무것도 넣지 않는다
 */
export function GatePicker({
  html, render, initial, present, ready, disabled, onApply,
}: {
  html: string; render: GateRender | null; initial: GatePicks; present: Record<Target, boolean>; ready: Record<Target, boolean>;
  disabled: boolean; onApply: (picks: GatePicks) => void;
}) {
  const [target, setTarget] = useState<Target>('image');
  const [picks, setPicks] = useState<GatePicks>(initial);
  const empty = html.trim().length === 0 || !render;

  const doc = useMemo(() => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'), [html]);
  //  깊은 요소가 위에 오도록 경로 길이 순 — 겹치는 영역에서 안쪽 요소가 클릭을 받는다
  const boxes = useMemo(() => (render ? [...render.boxes].sort((a, b) => a.path.length - b.path.length) : []), [render]);

  function click(box: GateBox) {
    setPicks((prev) => {
      if (box.marker) {
        //  들어 있는 블록: 그 종류의 뺌/유지 토글
        const key = box.marker;
        return { ...prev, [key]: prev[key] === 'remove' ? null : 'remove' };
      }
      const cur = prev[target];
      const same = typeof cur === 'object' && cur !== null && samePath(cur.path, box.path);
      return { ...prev, [target]: same ? null : { path: box.path, w: box.w, h: box.h } };
    });
  }

  const describe = (pick: GatePick) => {
    const el = resolvePath(doc.body, pick.path);
    if (!el) return '(요소를 찾지 못함)';
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const imgs = el.querySelectorAll('img').length + (el.tagName === 'IMG' ? 1 : 0);
    return `<${el.tagName.toLowerCase()}> ${pick.w}×${pick.h}${text ? ` "${text}"` : ''}${imgs ? ` · 이미지 ${imgs}장` : ''}`;
  };

  const pickedOf = (box: GateBox): Target | 'remove' | null => {
    if (box.marker) return picks[box.marker] === 'remove' ? 'remove' : null;
    for (const t of ['image', 'youtube'] as Target[]) {
      const p = picks[t];
      if (typeof p === 'object' && p && samePath(p.path, box.path)) return t;
    }
    return null;
  };

  const status = (t: Target) => {
    const p = picks[t];
    if (p === 'remove') return <span className="text-destructive">대문에서 뺍니다</span>;
    if (typeof p === 'object' && p) {
      return (
        <>
          <span className="text-foreground">{describe(p)}</span>
          {!ready[t] && (
            <span className="ml-2 text-amber-600 dark:text-amber-400">
              — 자리는 골랐지만 {t === 'image' ? '대문 이미지' : '유튜브 채널'} 설정이 아직 완료되지 않아 반영되지 않습니다.{' '}
              <Link href={t === 'image' ? '/streamer/cafe/editor' : '/streamer/cafe/youtube'} className="underline">설정하러 가기</Link>
            </span>
          )}
        </>
      );
    }
    return present[t] ? <span className="text-green-700 dark:text-green-400">대문에 들어 있음</span> : <span>고르지 않음 — 넣지 않습니다</span>;
  };

  return (
    <div className="flex flex-col gap-3">
      {empty ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {html.trim() ? '대문 미리보기를 만들지 못했습니다. 다시 가져와주세요.' : '대문이 비어 있어 자리를 고를 수 없습니다. 네이버 카페에서 대문을 먼저 꾸민 뒤 다시 가져와주세요.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">고르는 중:</span>
            {(['image', 'youtube'] as Target[]).map((t) => (
              <Button key={t} size="sm" variant={target === t ? 'default' : 'outline'} onClick={() => setTarget(t)}>
                <span className={cn('size-2 rounded-full', t === 'image' ? 'bg-pink-500' : 'bg-red-500')} /> {LABEL[t]} 자리
              </Button>
            ))}
          </div>
          {/* 네이버 대문과 같은 836px 렌더. 폭에 맞춰 축소되고 클릭 영역은 % 로 따라간다 */}
          <div className="relative w-full overflow-hidden rounded-md border bg-white" style={{ maxWidth: render.width }}>
            <img src={`data:image/png;base64,${render.png}`} alt="카페 대문 미리보기" width={render.width} height={render.height} className="block h-auto w-full select-none" draggable={false} />
            {boxes.map((b) => {
              const picked = pickedOf(b);
              return (
                <button
                  key={b.path.join('.')}
                  type="button"
                  title={b.marker ? `현재 ${LABEL[b.marker]} (클릭하면 뺌/유지)` : `<${b.tag}> ${b.w}×${b.h}`}
                  onClick={() => click(b)}
                  className={cn(
                    'absolute cursor-pointer outline-offset-[-2px] hover:bg-sky-400/15 hover:outline hover:outline-2 hover:outline-dashed hover:outline-sky-400',
                    b.marker && 'outline outline-2 outline-green-500',
                    picked === 'image' && 'bg-pink-500/15 outline outline-[3px] outline-pink-500',
                    picked === 'youtube' && 'bg-red-500/15 outline outline-[3px] outline-red-500',
                    picked === 'remove' && 'bg-destructive/20 outline outline-[3px] outline-destructive',
                  )}
                  style={{ left: `${(b.x / render.width) * 100}%`, top: `${(b.y / render.height) * 100}%`, width: `${(b.w / render.width) * 100}%`, height: `${(b.h / render.height) * 100}%`, zIndex: b.path.length }}
                >
                  {b.marker && <span className="absolute left-0 top-0 rounded-br bg-green-600 px-1 text-[10px] leading-4 text-white">현재 {LABEL[b.marker]}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li><span className="font-medium text-foreground">이미지:</span> {status('image')}</li>
        <li><span className="font-medium text-foreground">유튜브:</span> {status('youtube')}</li>
      </ul>
      <div className="flex justify-end">
        <Button disabled={disabled || empty} onClick={() => onApply(picks)}>대문에 반영</Button>
      </div>
    </div>
  );
}

function resolvePath(root: Element, path: number[]): Element | null {
  let cur: Element | null = root;
  for (const i of path) {
    cur = cur?.children[i] ?? null;
    if (!cur) return null;
  }
  return cur === root ? null : cur;
}
function samePath(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
