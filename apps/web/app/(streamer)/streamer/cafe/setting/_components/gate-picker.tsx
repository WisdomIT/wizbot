'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Target = 'image' | 'youtube';
/** body 에서부터의 자식 요소 인덱스 경로 — 렌더한 문서와 새로 파싱한 문서가 같은 파서를 쓰므로 같은 경로를 가리킨다 */
type Path = number[];

const PICK_CLASS: Record<Target, string> = { image: '__wz-image', youtube: '__wz-youtube' };

/**
 * 대문 HTML 을 그대로 렌더하고, 요소를 클릭해 위즈봇 블록이 들어갈 자리를 고른다 (#9 PR3).
 * 스크립트는 CSP 로 막고(sandbox 에 allow-scripts 없음), 같은 출처(allow-same-origin)라 부모가 클릭을 받는다.
 * 고른 요소는 통째로 교체되고, 고르지 않으면 맨 아래에 붙는다.
 */
export function GatePicker({
  html, imageBlock, youtubeTag, disabled, onSubmit,
}: {
  html: string; imageBlock: string; youtubeTag: string | null; disabled: boolean; onSubmit: (html: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [target, setTarget] = useState<Target>('image');
  const [picks, setPicks] = useState<Record<Target, Path | null>>({ image: null, youtube: null });
  const [height, setHeight] = useState(200);
  const empty = html.trim().length === 0;

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'">
<base target="_blank">
<style>
  body { margin: 8px; font-family: sans-serif; }
  body * { cursor: pointer !important; }
  a { pointer-events: none; }
  .__wz-hover { outline: 2px dashed #38bdf8 !important; outline-offset: 2px; }
  .__wz-image { outline: 3px solid #ec4899 !important; outline-offset: 2px; }
  .__wz-youtube { outline: 3px solid #ef4444 !important; outline-offset: 2px; }
</style></head><body>${html}</body></html>`;

  const applyMarks = useCallback((doc: Document, next: Record<Target, Path | null>) => {
    for (const cls of Object.values(PICK_CLASS)) doc.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
    for (const t of ['image', 'youtube'] as Target[]) {
      const el = next[t] && resolvePath(doc.body, next[t]!);
      if (el) el.classList.add(PICK_CLASS[t]);
    }
  }, []);

  //  iframe 문서가 준비되면 클릭·호버를 받는다
  const targetRef = useRef(target);
  targetRef.current = target;
  const picksRef = useRef(picks);
  picksRef.current = picks;
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let cleanup = () => {};
    const attach = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      setHeight(Math.min(800, Math.max(120, doc.documentElement.scrollHeight + 16)));
      applyMarks(doc, picksRef.current);
      let hovered: Element | null = null;
      const over = (e: Event) => {
        const el = pickable(doc, e.target);
        if (hovered && hovered !== el) hovered.classList.remove('__wz-hover');
        hovered = el;
        el?.classList.add('__wz-hover');
      };
      const out = () => { hovered?.classList.remove('__wz-hover'); hovered = null; };
      const click = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const el = pickable(doc, e.target);
        if (!el) return;
        const path = pathOf(doc.body, el);
        const t = targetRef.current;
        //  같은 요소를 다시 누르면 선택 해제
        const next = { ...picksRef.current, [t]: samePath(picksRef.current[t], path) ? null : path };
        setPicks(next);
        applyMarks(doc, next);
      };
      doc.addEventListener('mouseover', over);
      doc.addEventListener('mouseleave', out);
      doc.addEventListener('click', click, true);
      cleanup = () => {
        doc.removeEventListener('mouseover', over);
        doc.removeEventListener('mouseleave', out);
        doc.removeEventListener('click', click, true);
      };
    };
    iframe.addEventListener('load', attach);
    if (iframe.contentDocument?.readyState === 'complete') attach();
    return () => { iframe.removeEventListener('load', attach); cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcDoc]);

  function build(): string {
    //  렌더에 쓴 문서가 아니라 원본을 새로 파싱한다 — 표시용 class 가 섞이지 않게
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const imageEl = picks.image ? resolvePath(doc.body, picks.image) : null;
    const youtubeEl = youtubeTag && picks.youtube ? resolvePath(doc.body, picks.youtube) : null;
    //  경로는 둘 다 원본 기준이라 요소를 먼저 잡아둔 뒤 교체한다. 같은 요소를 골랐으면 이미지 뒤에 유튜브
    if (youtubeTag && youtubeEl && youtubeEl !== imageEl) youtubeEl.outerHTML = youtubeTag;
    if (imageEl) imageEl.outerHTML = youtubeTag && youtubeEl === imageEl ? imageBlock + youtubeTag : imageBlock;
    else doc.body.insertAdjacentHTML('beforeend', imageBlock);
    if (youtubeTag && !youtubeEl) {
      const img = doc.body.querySelector('img[alt="chzzk-automation"]');
      const block = img?.closest('p') ?? img;
      if (block) block.insertAdjacentHTML('afterend', youtubeTag);
    }
    return doc.body.innerHTML;
  }

  const describe = (path: Path | null) => {
    const doc = iframeRef.current?.contentDocument;
    const el = doc && path ? resolvePath(doc.body, path) : null;
    if (!el) return null;
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const imgs = el.querySelectorAll('img').length + (el.tagName === 'IMG' ? 1 : 0);
    return `<${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ''}${imgs ? ` · 이미지 ${imgs}장` : ''}`;
  };

  return (
    <div className="flex flex-col gap-3">
      {empty ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">대문이 비어 있습니다 — 위즈봇 블록만 들어갑니다.</p>
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
          <iframe
            ref={iframeRef}
            title="카페 대문 미리보기"
            sandbox="allow-same-origin"
            srcDoc={srcDoc}
            className="w-full rounded-md border bg-white"
            style={{ height }}
          />
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

function pickable(doc: Document, target: EventTarget | null): Element | null {
  const el = target instanceof Element ? target : null;
  if (!el || el === doc.body || el === doc.documentElement) return null;
  return el;
}
function pathOf(root: Element, el: Element): Path {
  const path: Path = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    const parent: Element | null = cur.parentElement;
    if (!parent) return path;
    path.unshift(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return path;
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
