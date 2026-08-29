'use client';

import { CAFE_ELEMENT_LABEL, type CafeElement, THUMBNAIL_RATIO } from '@wizbot/shared/lib/cafeLayout';
import type { MutableRefObject, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '@/lib/utils';

export type DragState = {
  id: string;
  mode: 'move' | 'resize';
  handle?: Handle;
  startX: number;
  startY: number;
  origin: { x: number; y: number; w: number; h: number };
};

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN_SIZE = 16;

/**
 * 캔버스 위의 요소 박스 (#9 PR2a). 드래그 이동·8방향 리사이즈. 좌표는 캔버스 원본 픽셀이고
 * 화면은 scale 로 축소돼 있으므로 포인터 이동량을 scale 로 나눈다.
 */
export function ElementBox({
  element, selected, scale, sampleText, fontFamily, dragRef, canvas, onSelect, onChange,
}: {
  element: CafeElement; selected: boolean; scale: number; sampleText: string; fontFamily?: string;
  dragRef: MutableRefObject<DragState | null>; canvas: { width: number; height: number };
  onSelect: () => void; onChange: (patch: Partial<CafeElement>) => void;
}) {
  function start(e: ReactPointerEvent, mode: DragState['mode'], handle?: Handle) {
    e.stopPropagation();
    onSelect();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { id: element.id, mode, handle, startX: e.clientX, startY: e.clientY, origin: { x: element.x, y: element.y, w: element.w, h: element.h } };
  }
  function move(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || d.id !== element.id) return;
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    const o = d.origin;
    if (d.mode === 'move') {
      onChange({
        x: Math.round(Math.min(Math.max(0, o.x + dx), canvas.width - o.w)),
        y: Math.round(Math.min(Math.max(0, o.y + dy), canvas.height - o.h)),
      });
      return;
    }
    let { x, y, w, h } = o;
    const hd = d.handle ?? 'se';
    if (hd.includes('e')) w = Math.max(MIN_SIZE, o.w + dx);
    if (hd.includes('s')) h = Math.max(MIN_SIZE, o.h + dy);
    if (hd.includes('w')) { w = Math.max(MIN_SIZE, o.w - dx); x = o.x + (o.w - w); }
    if (hd.includes('n')) { h = Math.max(MIN_SIZE, o.h - dy); y = o.y + (o.h - h); }
    if (element.kind === 'thumbnail') {
      // 16:9 고정 — 가로를 잡는 핸들이면 세로가, 세로만 잡으면 가로가 따라온다
      if (hd === 'n' || hd === 's') w = h * THUMBNAIL_RATIO;
      else h = w / THUMBNAIL_RATIO;
      if (hd.includes('w')) x = o.x + o.w - w;
      if (hd.includes('n')) y = o.y + o.h - h;
    }
    onChange({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }
  function end() {
    if (dragRef.current?.id === element.id) dragRef.current = null;
  }

  const isText = element.kind !== 'thumbnail';
  const lines = isText ? element.lines : 1;
  const fontSize = isText ? (element.fontSize ?? Math.floor((element.h / lines) * 0.8)) : 0;

  return (
    <div
      className={cn('absolute cursor-move', selected ? 'outline outline-2 outline-sky-400' : 'outline outline-1 outline-dashed outline-white/40 hover:outline-sky-300')}
      style={{ left: element.x, top: element.y, width: element.w, height: element.h }}
      onPointerDown={(e) => start(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {isText ? (
        <div
          className="flex h-full w-full items-center overflow-hidden"
          style={{ fontFamily, fontSize, fontWeight: element.weight, color: element.color, justifyContent: element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center', lineHeight: 1.2, textAlign: element.align }}
        >
          {/* 실제 렌더와 같은 규칙은 아니지만(줄바꿈은 캔버스가 정한다) 줄 수·크기 감은 맞춘다 */}
          <span
            className="overflow-hidden"
            style={lines > 1
              ? { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', whiteSpace: 'normal', wordBreak: 'break-all' }
              : { whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}
          >
            {sampleText || CAFE_ELEMENT_LABEL[element.kind]}
          </span>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-black/40 text-sm text-white/80" style={{ borderRadius: element.radius }}>
          썸네일 {element.fit === 'cover' ? '(채우기)' : '(맞추기)'}
        </div>
      )}
      <span className="pointer-events-none absolute -top-5 left-0 rounded bg-sky-500 px-1 text-[10px] leading-4 text-white" style={{ fontSize: 10 / scale, lineHeight: `${16 / scale}px`, top: -20 / scale }}>
        {CAFE_ELEMENT_LABEL[element.kind]}
      </span>
      {selected && HANDLES.map((h) => (
        <div
          key={h}
          onPointerDown={(e) => start(e, 'resize', h)}
          onPointerMove={move}
          onPointerUp={end}
          className="absolute bg-white outline outline-1 outline-sky-500"
          style={{ ...handleStyle(h, scale), cursor: `${h}-resize` }}
        />
      ))}
    </div>
  );
}

function handleStyle(h: Handle, scale: number): React.CSSProperties {
  const size = 10 / scale;
  const off = -size / 2;
  const s: React.CSSProperties = { width: size, height: size };
  if (h.includes('n')) s.top = off; if (h.includes('s')) s.bottom = off;
  if (h.includes('w')) s.left = off; if (h.includes('e')) s.right = off;
  if (h === 'n' || h === 's') { s.left = '50%'; s.marginLeft = off; }
  if (h === 'e' || h === 'w') { s.top = '50%'; s.marginTop = off; }
  return s;
}
