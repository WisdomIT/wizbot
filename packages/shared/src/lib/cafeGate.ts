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

/** 워커가 렌더한 대문의 요소 하나 — body 로부터의 자식 인덱스 경로와 CSS px 좌표 */
export type GateBox = { path: number[]; tag: string; x: number; y: number; w: number; h: number };
/** 렌더 폭 = 네이버 대문 폭 */
export const GATE_RENDER_WIDTH = 836;

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
