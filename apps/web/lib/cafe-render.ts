import 'server-only';

import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import type { CafeSceneLayout, CafeSnapshot, CafeTextElement } from '@wizbot/shared/lib/cafeLayout';
import { elementText } from '@wizbot/shared/lib/cafeLayout';

import { fitText } from './cafe-fit';
import { ensureFontsRegistered, fontFamilyChain } from './cafe-fonts';

/**
 * 카페 대문 상태 이미지 렌더 (#9 PR2). 순수하게 (레이아웃, 스냅샷, 배경) → PNG.
 * 같은 입력이면 같은 그림이어야 한다 — 이미지 URL 의 ?v= 로 영구 캐시되기 때문이다.
 */

export type RenderInput = {
  layout: CafeSceneLayout;
  snapshot: CafeSnapshot;
  background: { mimeType: string; base64: string } | null;
};

function fontString(element: CafeTextElement, size: number): string {
  return `${element.weight} ${size}px ${fontFamilyChain(element.fontKey)}`;
}

function drawText(ctx: SKRSContext2D, element: CafeTextElement, snapshot: CafeSnapshot) {
  const raw = elementText(element.kind, snapshot, element);
  if (!raw) return;
  const measure = (text: string, size: number) => {
    ctx.font = fontString(element, size);
    return ctx.measureText(text).width;
  };
  const { text, size } = fitText(measure, raw, element, element.fontSize);
  ctx.font = fontString(element, size);
  ctx.fillStyle = element.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = element.align;
  const x = element.align === 'left' ? element.x : element.align === 'right' ? element.x + element.w : element.x + element.w / 2;
  ctx.fillText(text, x, element.y + element.h / 2);
}

async function drawThumbnail(
  ctx: SKRSContext2D,
  element: Extract<CafeSceneLayout['elements'][number], { kind: 'thumbnail' }>,
  url: string | null,
) {
  if (!url) return;
  let image;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    image = await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return; // 썸네일을 못 받아도 나머지는 그린다
  }
  const { x, y, w, h, fit, radius } = element;
  const scale = fit === 'cover' ? Math.max(w / image.width, h / image.height) : Math.min(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(image, dx, dy, dw, dh);
  ctx.restore();
}

export async function renderCafeImage(input: RenderInput): Promise<Buffer> {
  ensureFontsRegistered();
  const { width, height } = input.layout;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (input.background) {
    const image = await loadImage(Buffer.from(input.background.base64, 'base64'));
    ctx.drawImage(image, 0, 0, width, height);
  } else {
    //  배경이 없으면 에디터에서 위치를 볼 수 있게 어두운 바탕
    ctx.fillStyle = '#1b1b2f';
    ctx.fillRect(0, 0, width, height);
  }

  for (const element of input.layout.elements) {
    if (element.kind === 'thumbnail') await drawThumbnail(ctx, element, input.snapshot.thumbnailUrl);
    else drawText(ctx, element, input.snapshot);
  }
  return canvas.toBuffer('image/png');
}
