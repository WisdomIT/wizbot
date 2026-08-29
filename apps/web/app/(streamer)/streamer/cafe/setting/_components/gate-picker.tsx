'use client';

import { type GateBox } from '@wizbot/shared/lib/cafeGate';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Target = 'image' | 'youtube';
/** body 에서부터의 자식 요소 인덱스 경로 — 워커가 렌더한 DOM 과 여기서 새로 파싱한 DOM 이 같은 트리라 같은 경로를 가리킨다 */
type Path = number[];
export type GateRender = { png: string; width: number; height: number; boxes: GateBox[] };

/**
 * 워커가 네이버 대문 폭(836px)으로 렌더한 스크린샷 위에 요소별 투명 클릭 영역을 얹어 자리를 고른다 (#9).
 * 콘솔에서 HTML 을 직접 렌더하면 카페 이미지가 Referer 검사로 403 이 나고 폭·CSS 도 네이버와 달라서
 * 워커가 그린 그림을 그대로 쓴다. 고른 요소는 통째로 교체되고, 고르지 않으면 맨 아래에 붙는다.
 */
export function GatePicker({
  html, render, imageBlock, youtubeTag, disabled, onSubmit,
}: {
  html: string; render: GateRender | null; imageBlock: string; youtubeTag: string | null; disabled: boolean; onSubmit: (html: string) => void;
}) {
  const [target, setTarget] = useState<Target>('image');
  const [picks, setPicks] = useState<Record<Target, Path | null>>({ image: null, youtube: null });
  const empty = html.trim().length === 0 || !render;

  //  원본을 파싱해 둔다 — 설명 문구와 최종 HTML 생성에 쓴다
  const doc = useMemo(() => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html'), [html]);
  //  깊은 요소가 위에 오도록 경로 길이 순 — 겹치는 영역에서 안쪽 요소가 클릭을 받는다
  const boxes = useMemo(() => (render ? [...render.boxes].sort((a, b) => a.path.length - b.path.length) : []), [render]);

  function toggle(path: Path) {
    setPicks((prev) => ({ ...prev, [target]: samePath(prev[target], path) ? null : path }));
  }

  function build(): string {
    const out = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const imageEl = picks.image ? resolvePath(out.body, picks.image) : null;
    const youtubeEl = youtubeTag && picks.youtube ? resolvePath(out.body, picks.youtube) : null;
    //  경로는 둘 다 원본 기준이라 요소를 먼저 잡아둔 뒤 교체한다. 같은 요소를 골랐으면 이미지 뒤에 유튜브
    if (youtubeTag && youtubeEl && youtubeEl !== imageEl) youtubeEl.outerHTML = youtubeTag;
    if (imageEl) imageEl.outerHTML = youtubeTag && youtubeEl === imageEl ? imageBlock + youtubeTag : imageBlock;
    else out.body.insertAdjacentHTML('beforeend', imageBlock);
    if (youtubeTag && !youtubeEl) {
      const img = out.body.querySelector('img[alt="chzzk-automation"]');
      const block = img?.closest('p') ?? img;
      if (block) block.insertAdjacentHTML('afterend', youtubeTag);
    }
    return out.body.innerHTML;
  }

  const describe = (path: Path | null) => {
    const el = path ? resolvePath(doc.body, path) : null;
    if (!el) return null;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const imgs = el.querySelectorAll('img').length + (el.tagName === 'IMG' ? 1 : 0);
    return `<${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ''}${imgs ? ` · 이미지 ${imgs}장` : ''}`;
  };

  return (
    <div className="flex flex-col gap-3">
      {empty ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          {html.trim() ? '대문 미리보기를 만들지 못했습니다 — 위즈봇 블록은 맨 아래에 추가됩니다.' : '대문이 비어 있습니다 — 위즈봇 블록만 들어갑니다.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">고르는 중:</span>
            <Button size="sm" variant={target === 'image' ? 'default' : 'outline'} onClick={() => setTarget('image')}>
              <span className="size-2 rounded-full bg-pink-500" /> 방송 상태 이미지 자리
            </Button>
            {youtubeTag && (
              <Button size="sm" variant={target === 'youtube' ? 'default' : 'outline'} onClick={() => setTarget('youtube')}>
                <span className="size-2 rounded-full bg-red-500" /> 유튜브 자리
              </Button>
            )}
          </div>
          {/* 네이버 대문과 같은 836px 렌더. 폭에 맞춰 축소되고 클릭 영역은 % 로 따라간다 */}
          <div className="relative w-full overflow-hidden rounded-md border bg-white" style={{ maxWidth: render.width }}>
            <img src={`data:image/png;base64,${render.png}`} alt="카페 대문 미리보기" width={render.width} height={render.height} className="block h-auto w-full select-none" draggable={false} />
            {boxes.map((b) => {
              const picked = (['image', 'youtube'] as Target[]).find((t) => samePath(picks[t], b.path));
              return (
                <button
                  key={b.path.join('.')}
                  type="button"
                  title={`<${b.tag}>`}
                  onClick={() => toggle(b.path)}
                  className={cn(
                    'absolute cursor-pointer outline-offset-[-2px] hover:bg-sky-400/15 hover:outline hover:outline-2 hover:outline-dashed hover:outline-sky-400',
                    picked === 'image' && 'bg-pink-500/15 outline outline-[3px] outline-pink-500',
                    picked === 'youtube' && 'bg-red-500/15 outline outline-[3px] outline-red-500',
                  )}
                  style={{
                    left: `${(b.x / render.width) * 100}%`,
                    top: `${(b.y / render.height) * 100}%`,
                    width: `${(b.w / render.width) * 100}%`,
                    height: `${(b.h / render.height) * 100}%`,
                    zIndex: b.path.length,
                  }}
                />
              );
            })}
          </div>
          <ul className="text-sm text-muted-foreground">
            <li className={cn(picks.image && 'text-foreground')}>이미지: {describe(picks.image) ?? '고르지 않음 → 맨 아래에 추가'}</li>
            {youtubeTag && <li className={cn(picks.youtube && 'text-foreground')}>유튜브: {describe(picks.youtube) ?? '고르지 않음 → 이미지 바로 아래'}</li>}
          </ul>
        </>
      )}
      <div className="flex justify-end">
        <Button disabled={disabled} onClick={() => onSubmit(build())}>대문에 넣기</Button>
      </div>
    </div>
  );
}

function resolvePath(root: Element, path: Path): Element | null {
  let cur: Element | null = root;
  for (const i of path) {
    cur = cur?.children[i] ?? null;
    if (!cur) return null;
  }
  return cur === root ? null : cur;
}
function samePath(a: Path | null, b: Path): boolean {
  return !!a && a.length === b.length && a.every((v, i) => v === b[i]);
}
