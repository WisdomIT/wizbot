import { z } from 'zod';

import { uploadsPlaylistId } from './cafe';

/**
 * 카페 대문 HTML 에 들어가는 위즈봇 블록 (#9 PR3). 순수 함수 — 워커·API·콘솔이 같은 규칙을 쓴다.
 *
 * 실측 (2026-08-31, 테스트 카페 HTML 모드 저장):
 *   - HTML 주석·data-* 속성은 지워진다 → 표식은 `alt` 로 (참고 구현과 같은 값이라 기존 카페와 호환)
 *   - <img> 에 width/height 를 명시하면 유지되고, 없으면(style 만) width="100" 이 붙는다
 *   - 저장할 때마다 style 에 height 가 누적되므로 워커는 src 만 바꾸지 않고 <img> 태그를 통째로 다시 만든다
 *   - <p> 안의 <iframe> 은 밖으로 꺼내진다 → 최상위에 둔다
 */
export const GATE_IMAGE_MARKER = 'chzzk-automation';

/** 워커가 렌더한 대문의 요소 하나 — body 로부터의 자식 인덱스 경로와 CSS px 좌표. marker 는 이미 들어 있는 위즈봇 블록 */
export type GateBox = { path: number[]; tag: string; x: number; y: number; w: number; h: number; marker?: 'image' | 'youtube' };
/** 위즈봇 유튜브 iframe 판별 — 업로드 재생목록(UU…) nocookie embed */
export const YOUTUBE_TAG_SELECTOR = 'iframe[src^="https://www.youtube-nocookie.com/embed/videoseries?list=UU"]';
export const IMAGE_TAG_SELECTOR = 'img[alt="chzzk-automation"]';
/** 렌더 폭 = 네이버 대문 폭 */
export const GATE_RENDER_WIDTH = 836;

/** 표식 <img> 의 width/height 속성 — 갱신 때 크기를 그대로 이어받는다 (지정한 요소 크기) */
export function imageSizeOf(tag: string): { width: number; height: number } | null {
  const w = Number(tag.match(/\bwidth=["'](\d+)/i)?.[1]);
  const h = Number(tag.match(/\bheight=["'](\d+)/i)?.[1]);
  return w > 0 && h > 0 ? { width: w, height: h } : null;
}

export function cafeImageUrl(siteUrl: string, channelId: string, serial: number): string {
  return `${siteUrl.replace(/\/$/, '')}/cafe/${channelId}.png?v=${serial}`;
}

function attr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function buildImageTag(o: { src: string; width: number; height: number }): string {
  return `<img src="${attr(o.src)}" width="${o.width}" height="${o.height}" alt="${GATE_IMAGE_MARKER}">`;
}

/** 최초 삽입 블록 — 이미지를 치지직 채널 링크로 감싼다 */
export function buildImageBlock(o: { src: string; width: number; height: number; href: string }): string {
  return `<p><a href="${attr(o.href)}">${buildImageTag(o)}</a></p>`;
}

/** 업로드 재생목록 embed — 새 영상은 유튜브가 알아서 보여주므로 이후 갱신이 필요 없다 */
export function buildYoutubeTag(channelId: string, width: number, height: number): string {
  const list = uploadsPlaylistId(channelId);
  return `<iframe src="https://www.youtube-nocookie.com/embed/videoseries?list=${list}" width="${width}" height="${height}" frameborder="0" allowfullscreen=""></iframe>`;
}

const IMAGE_TAG_RE = /<img\b[^>]*\balt=["']chzzk-automation["'][^>]*>/gi;

export function findImageTags(html: string): string[] {
  return html.match(IMAGE_TAG_RE) ?? [];
}

/** 표식이 붙은 <img> 를 전부 새 태그로 교체 */
export function replaceImageTags(html: string, tag: string): { html: string; count: number } {
  let count = 0;
  const out = html.replace(IMAGE_TAG_RE, () => { count += 1; return tag; });
  return { html: out, count };
}

/** 표식 이미지의 src */
export function imageSrcOf(tag: string): string | null {
  return tag.match(/\bsrc=["']([^"']*)["']/i)?.[1] ?? null;
}

/** 읽어온 HTML 비교용 — 네이버가 줄 끝 공백·줄바꿈을 붙이므로 공백을 접어서 본다 */
export function normalizeGateHtml(html: string): string {
  return html.replace(/\s+/g, ' ').trim();
}

const YOUTUBE_TAG_RE = /<iframe\b[^>]*\bsrc=["']https:\/\/www\.youtube-nocookie\.com\/embed\/videoseries\?list=UU[^"']*["'][^>]*>/gi;

export function findYoutubeTags(html: string): string[] {
  return html.match(YOUTUBE_TAG_RE) ?? [];
}

/* ── 자리 선택과 반영 계획 (#9) ── */

/** 스트리머가 고른 요소 — 렌더 시점 HTML 의 경로와 그 요소의 렌더 크기(유튜브 iframe 크기가 된다) */
export const gatePickSchema = z.object({
  path: z.array(z.number().int().min(0)).min(1).max(40),
  w: z.number().int().min(1).max(4000),
  h: z.number().int().min(1).max(4000),
});
export type GatePick = z.infer<typeof gatePickSchema>;
/** 객체 = 이 자리로 교체, 'remove' = 들어 있는 블록 제거, null = 그대로 */
const pickStateSchema = z.union([gatePickSchema, z.literal('remove'), z.null()]).default(null);
export const gatePicksSchema = z.object({ image: pickStateSchema, youtube: pickStateSchema });
export type GatePicks = z.infer<typeof gatePicksSchema>;
export const EMPTY_PICKS: GatePicks = { image: null, youtube: null };

export type GateOp = { kind: 'replace'; path: number[]; html: string } | { kind: 'remove' } | null;
export type GatePlan = { image: GateOp; youtube: GateOp };

/**
 * 워커가 할 일. 설정이 미완인 자리(배경 없음 / 채널 없음)는 건드리지 않고 경로만 남긴다 —
 * 설정이 끝나면 다시 반영된다. 블록 크기는 이미지·유튜브 모두 지정한 요소의 렌더 크기 그대로.
 */
export function buildGatePlan(o: {
  html: string;
  picks: GatePicks;
  image: { ready: boolean; src: string; href: string };
  youtube: { channelId: string | null };
}): GatePlan {
  const image: GateOp =
    o.picks.image === 'remove'
      ? findImageTags(o.html).length ? { kind: 'remove' } : null
      : o.picks.image && o.image.ready
        ? { kind: 'replace', path: o.picks.image.path, html: buildImageBlock({ ...o.image, width: o.picks.image.w, height: o.picks.image.h }) }
        : null;
  const youtube: GateOp =
    o.picks.youtube === 'remove'
      ? findYoutubeTags(o.html).length ? { kind: 'remove' } : null
      : o.picks.youtube && o.youtube.channelId
        ? { kind: 'replace', path: o.picks.youtube.path, html: buildYoutubeTag(o.youtube.channelId, o.picks.youtube.w, o.picks.youtube.h) }
        : null;
  return { image, youtube };
}
