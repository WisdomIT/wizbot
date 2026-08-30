import 'server-only';

import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import type { CafeSceneLayout, CafeSnapshot, CafeTextElement } from '@wizbot/shared/lib/cafeLayout';
import { elementText } from '@wizbot/shared/lib/cafeLayout';

import { fitLines } from './cafe-fit';
import { ensureFontsRegistered, fontFamilyChain } from './cafe-fonts';

/**
 * 카페 대문 상태 이미지 렌더 (#9 PR2). 순수하게 (레이아웃, 스냅샷, 배경) → PNG.
 * 같은 입력이면 같은 그림이어야 한다 — 이미지 URL 의 ?v= 로 영구 캐시되기 때문이다.
 */

export type RenderInput = {
  layout: CafeSceneLayout;
  snapshot: CafeSnapshot;
  background: { mimeType: string; base64: string } | null;
  /** 샘플 데이터 미리보기 — 썸네일이 없으면 자리표시 이미지를 그린다 */
  sample?: boolean;
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
  const { lines, size } = fitLines(measure, raw, element, element.lines, element.fontSize);
  ctx.font = fontString(element, size);
  ctx.fillStyle = element.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = element.align;
  const x = element.align === 'left' ? element.x : element.align === 'right' ? element.x + element.w : element.x + element.w / 2;
  //  줄 간격 1.2, 전체 블록을 영역 세로 가운데에
  const lineHeight = size * 1.2;
  const top = element.y + (element.h - lineHeight * lines.length) / 2;
  lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * i + lineHeight / 2));
}

/** 샘플 미리보기용 자리표시 썸네일 — 실제 방송이 없을 때 16:9 영역이 어떻게 보이는지 */
function drawPlaceholderThumbnail(ctx: SKRSContext2D, box: { x: number; y: number; w: number; h: number; radius: number }) {
  const { x, y, w, h, radius } = box;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
  gradient.addColorStop(0, '#3a86ff');
  gradient.addColorStop(1, '#8338ec');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const size = Math.max(12, Math.floor(Math.min(w, h) * 0.16));
  ctx.font = `700 ${size}px "Noto Sans CJK KR"`;
  ctx.fillText('샘플 썸네일', x + w / 2, y + h / 2 - size * 0.4);
  ctx.font = `400 ${Math.floor(size * 0.6)}px "Noto Sans CJK KR"`;
  ctx.fillText('방송 중에는 실제 화면이 들어갑니다', x + w / 2, y + h / 2 + size * 0.6);
  ctx.restore();
}

async function drawThumbnail(
  ctx: SKRSContext2D,
  element: Extract<CafeSceneLayout['elements'][number], { kind: 'thumbnail' }>,
  url: string | null,
  sample: boolean,
) {
  if (!url) {
    if (sample) drawPlaceholderThumbnail(ctx, element);
    return;
  }
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
    if (element.kind === 'thumbnail') await drawThumbnail(ctx, element, input.snapshot.thumbnailUrl, input.sample ?? false);
    else drawText(ctx, element, input.snapshot);
  }
  return canvas.toBuffer('image/png');
}
