import fs from 'fs';
import path from 'path';

/**
 * 이용 안내 문서 리더 (#35 3/3). 단일 소스 `docs/manual/*.md` 를
 * 웹(/manual 렌더)과 에이전트(매뉴얼 tool)가 함께 읽는다.
 * frontmatter: title · audience(streamer|viewer) · order · description.
 */

export interface ManualPageMeta {
  slug: string;
  title: string;
  /** 대상 독자 — 목차가 이 기준으로 묶인다 */
  audience: 'streamer' | 'viewer';
  order: number;
  description: string;
}

export interface ManualPage extends ManualPageMeta {
  body: string;
}

//  컨테이너(web·api)에서는 /app(작업 디렉터리) 아래, dev(next dev·tsx)에서는 앱 디렉터리가 cwd 라 루트로 올라간다
const CANDIDATES = ['docs/manual', path.join('..', '..', 'docs', 'manual')];

function defaultDir(): string | null {
  for (const candidate of CANDIDATES) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

function readPage(dir: string, file: string): ManualPage | null {
  if (!file.endsWith('.md')) return null;
  const { meta, body } = parseFrontmatter(fs.readFileSync(path.join(dir, file), 'utf-8'));
  return {
    slug: file.slice(0, -3),
    title: meta.title ?? file.slice(0, -3),
    audience: meta.audience === 'viewer' ? 'viewer' : 'streamer',
    order: Number(meta.order) || 999,
    description: meta.description ?? '',
    body,
  };
}

/** 목차 — order 순. baseDir 은 테스트용 오버라이드 */
export function listManualPages(baseDir?: string): ManualPageMeta[] {
  const dir = baseDir ?? defaultDir();
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((file) => readPage(dir, file))
    .filter((page): page is ManualPage => page !== null)
    .map(({ body: _body, ...meta }) => meta)
    .sort((a, b) => a.order - b.order);
}

export function getManualPage(slug: string, baseDir?: string): ManualPage | null {
  //  경로 조작 방지 — slug 는 파일 이름 조각이어야 한다
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const dir = baseDir ?? defaultDir();
  if (!dir || !fs.existsSync(path.join(dir, `${slug}.md`))) return null;
  return readPage(dir, `${slug}.md`);
}

export interface ManualSearchHit {
  slug: string;
  title: string;
  /** 일치한 줄과 앞뒤 한 줄 */
  snippet: string;
}

/** 줄 단위 부분일치 검색(대소문자 무시) — 페이지당 첫 일치의 주변 문맥을 돌려준다 */
export function searchManual(query: string, baseDir?: string): ManualSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const dir = baseDir ?? defaultDir();
  if (!dir || !fs.existsSync(dir)) return [];

  const hits: ManualSearchHit[] = [];
  for (const meta of listManualPages(dir)) {
    const page = getManualPage(meta.slug, dir);
    if (!page) continue;
    const lines = page.body.split('\n');
    const index = lines.findIndex((line) => line.toLowerCase().includes(needle));
    if (index < 0 && !page.title.toLowerCase().includes(needle)) continue;
    const snippet =
      index < 0
        ? page.description
        : lines
            .slice(Math.max(0, index - 1), index + 2)
            .join('\n')
            .trim();
    hits.push({ slug: page.slug, title: page.title, snippet: snippet.slice(0, 400) });
  }
  return hits;
}
