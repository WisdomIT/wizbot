import { createHash } from 'node:crypto';

/**
 * 위키 수집용 순수 함수 (#309) — 사이트맵 파싱, 내부 링크 수집, HTML → 텍스트 변환, 해시.
 * 대상은 Super(super.site)로 만든 노션 기반 사이트: 서버사이드 렌더링이라 `<main class="super-content">`
 * 안에 본문이 다 들어 있다. 파서 의존성 없이 정규식으로 블록 경계만 살려 텍스트를 만든다.
 */

/** 사이트맵의 <loc> 목록 — 같은 호스트만, 중복·앵커 제거, 디코드된 형태 */
export function parseSitemap(xml: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const out = new Set<string>();
  for (const match of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    const normalized = normalizeUrl(match[1], origin);
    if (normalized) out.add(normalized);
  }
  return [...out];
}

/** HTML 안의 같은 호스트 링크 — 사이트맵이 없을 때의 폴백 */
export function extractInternalLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const out = new Set<string>();
  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    const normalized = normalizeUrl(match[1], origin);
    if (normalized) out.add(normalized);
  }
  return [...out];
}

/** 같은 호스트의 페이지 주소만 — 앵커·쿼리 제거, 정적 자원·API 제외, 경로는 디코드해서 비교 */
export function normalizeUrl(href: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (/^\/(_next|api|styles|images|assets)(\/|$)/.test(path)) return null;
  if (/\.(css|js|png|jpe?g|gif|svg|webp|ico|woff2?|xml|txt|json)$/i.test(path)) return null;
  path = path.replace(/\/+$/, '') || '/';
  return `${origin}${path}`;
}

/**
 * 요청용 — 한글 슬러그를 퍼센트 인코딩. 16진수는 **소문자**로: Super 는 대문자(`%EC`)로 오면
 * 소문자 주소로 307 을 돌려줘 페이지마다 요청이 두 번 나간다 (실측)
 */
export function encodePageUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname.split('/').map((seg) => encodeURIComponent(decodeURIComponentSafe(seg)).toLowerCase()).join('/')}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–' };

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

export interface WikiPageText {
  title: string;
  /** 제목 계층(#)·목록(-)·표(|)를 살린 텍스트 */
  text: string;
}

/**
 * 페이지 HTML → 텍스트. `<main>` 이 있으면 그 안만(헤더·목차·푸터 제외). 노션 블록 구조:
 * heading → `#`, list-item → `-`, 표 행 → `| a | b |`, callout/quote → 문단. 이미지·임베드(노션 DB 뷰)는 비어 있어 자연히 빠진다
 */
export function htmlToText(html: string): WikiPageText {
  const title = decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  const mainMatch = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let body = mainMatch ? mainMatch[1] : html;
  body = body
    .replace(/<(script|style|noscript|svg|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    //  목차 블록은 본문이 아니다
    .replace(/<div\b[^>]*class="[^"]*notion-table-of-contents[^"]*"[^>]*>[\s\S]*?<\/div>/gi, ' ');

  //  블록 경계를 줄바꿈으로. 표는 셀을 |, 행을 줄로
  body = body
    .replace(/<\/(tr)>/gi, ' |\n')
    .replace(/<(td|th)\b[^>]*>/gi, '| ')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<h1\b[^>]*>/gi, '\n# ')
    .replace(/<h2\b[^>]*>/gi, '\n## ')
    .replace(/<h3\b[^>]*>/gi, '\n### ')
    .replace(/<(li)\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|blockquote|section|article|details|summary|table|figure|figcaption)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const lines = decodeEntities(body)
    .split('\n')
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .map((line) => line.replace(/^\|\s*\|$/, ''))
    .filter((line) => line.length > 0);
  //  같은 줄 반복(목차·앵커 텍스트)과 연속 공백 줄 정리
  const text = lines.filter((line, i) => i === 0 || line !== lines[i - 1]).join('\n');
  return { title, text };
}

export function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
