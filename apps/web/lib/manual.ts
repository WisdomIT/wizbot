import fs from 'fs';
import path from 'path';

/**
 * 이용 안내 문서 (#35 3/3). 단일 소스 `docs/manual/*.md` 를 웹(/manual)과
 * 에이전트(매뉴얼 tool, api)가 함께 읽는다. frontmatter: title·audience·order·description.
 */

export interface ManualPageMeta {
  slug: string;
  title: string;
  /** 대상 독자 — 목차가 이 기준으로 묶인다 */
  audience: 'streamer' | 'viewer';
  order: number;
  description: string;
}

//  standalone 컨테이너에서는 /app(작업 디렉터리) 아래, next dev 에서는 apps/web 이 cwd 라 루트로 올라간다
const CANDIDATES = ['docs/manual', path.join('..', '..', 'docs', 'manual')];

function manualDir(): string | null {
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

function readPage(dir: string, file: string): (ManualPageMeta & { body: string }) | null {
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

export function listManualPages(): ManualPageMeta[] {
  const dir = manualDir();
  if (!dir) return [];
  return fs
    .readdirSync(dir)
    .map((file) => readPage(dir, file))
    .filter((page): page is NonNullable<typeof page> => page !== null)
    .map(({ body: _body, ...meta }) => meta)
    .sort((a, b) => a.order - b.order);
}

export function getManualPage(slug: string): (ManualPageMeta & { body: string }) | null {
  //  경로 조작 방지 — slug 는 파일 이름 조각이어야 한다
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const dir = manualDir();
  if (!dir) return null;
  const file = path.join(dir, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return readPage(dir, `${slug}.md`);
}
