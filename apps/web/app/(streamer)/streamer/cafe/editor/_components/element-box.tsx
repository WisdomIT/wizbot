'use client';

import { CAFE_ELEMENT_LABEL, type CafeElement } from '@wizbot/shared/lib/cafeLayout';
import type { PointerEvent as ReactPointerEvent } from 'react';

import type { Handle } from '@/lib/cafe-geometry';
import { cn } from '@/lib/utils';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * 캔버스 위의 요소 박스 (#9). 그리기와 포인터 시작만 맡고, 이동·리사이즈·스냅 계산은 캔버스가 한다
 * (여러 개를 함께 옮기고 다른 요소에 스냅하려면 캔버스가 전체를 알아야 한다).
 * 좌표는 캔버스 원본 픽셀이고 화면은 scale 로 축소돼 있어 핸들·라벨 크기는 scale 로 나눈다.
 */
export function ElementBox({
  element, selected, resizable, scale, sampleText, fontFamily, onPointerDown,
}: {
  element: CafeElement; selected: boolean; resizable: boolean; scale: number; sampleText: string; fontFamily?: string;
  onPointerDown: (e: ReactPointerEvent, mode: 'move' | 'resize', handle?: Handle) => void;
}) {
  const isText = element.kind !== 'thumbnail';
  const lines = isText ? element.lines : 1;
  const fontSize = isText ? (element.fontSize ?? Math.floor((element.h / lines) * 0.8)) : 0;

  return (
    <div
      className={cn('absolute cursor-move', selected ? 'outline outline-2 outline-sky-400' : 'outline outline-1 outline-dashed outline-white/40 hover:outline-sky-300')}
      style={{ left: element.x, top: element.y, width: element.w, height: element.h }}
      onPointerDown={(e) => onPointerDown(e, 'move')}
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
      {resizable && HANDLES.map((h) => (
        <div
          key={h}
          onPointerDown={(e) => onPointerDown(e, 'resize', h)}
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
