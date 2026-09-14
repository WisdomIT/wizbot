import type { PrismaClient, WikiSource } from '@prisma/client';

import { encodePageUrl, extractInternalLinks, hashContent, htmlToText, parseSitemap } from '../lib/wiki';
import { ServiceError } from './errors';
import { notifyAdmins } from './notify';

/**
 * 위키 소스·수집 (#309 1단계). 수집은 API 가 하고 챗봇 워커가 1시간마다 `crawlDue` 를 부른다.
 * 외부 사이트라 순차·요청 간격을 두고, 실패해도 기존 페이지는 남긴다 — 사이트 장애가 봇 장애로 번지지 않게.
 */

export const CRAWL_INTERVAL_MS = 60 * 60 * 1000;
/** 요청 간격·타임아웃 — 남의 사이트에 조심스럽게 */
export const REQUEST_GAP_MS = 1000;
export const REQUEST_TIMEOUT_MS = 10_000;
export const USER_AGENT = 'wizbot/1.0 (+https://github.com/WisdomIT/wizbot)';
const FAILURES_TO_NOTIFY = 3;
const MAX_CONTENT = 200_000;

export type FetchTextLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/* ── 어드민: 소스 ── */

export interface SourceInput {
  name: string;
  baseUrl: string;
  enabled: boolean;
  endsAt: Date | null;
  maxPages: number;
  viewerCooldownMinutes: number;
  perChannelDaily: number;
  globalDaily: number;
}

export function listSources(prisma: PrismaClient) {
  return prisma.wikiSource.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { pages: true } } } });
}

function normalizeBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ServiceError('INVALID_INPUT', '위키 주소가 올바르지 않습니다. https:// 로 시작하는 주소를 넣어주세요.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ServiceError('INVALID_INPUT', 'http(s) 주소만 됩니다.');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/`;
}

export async function saveSource(prisma: PrismaClient, id: number | null, input: SourceInput) {
  const data = { ...input, name: input.name.trim().slice(0, 60), baseUrl: normalizeBaseUrl(input.baseUrl) };
  if (!data.name) throw new ServiceError('INVALID_INPUT', '이름을 입력해주세요.');
  if (id === null) return prisma.wikiSource.create({ data });
  const existing = await prisma.wikiSource.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('NOT_FOUND', '위키 소스를 찾을 수 없습니다.');
  //  주소가 바뀌면 옛 페이지는 의미가 없다
  if (existing.baseUrl !== data.baseUrl) await prisma.wikiPage.deleteMany({ where: { sourceId: id } });
  return prisma.wikiSource.update({ where: { id }, data });
}

export async function removeSource(prisma: PrismaClient, id: number) {
  await prisma.wikiSource.delete({ where: { id } });
  return { ok: true as const };
}

export function listPages(prisma: PrismaClient, sourceId: number) {
  return prisma.wikiPage.findMany({
    where: { sourceId },
    orderBy: { url: 'asc' },
    select: { id: true, url: true, title: true, fetchedAt: true, changedAt: true, hash: true },
  });
}

/* ── 수집 ── */

/** 지금 답변·수집할 수 있는 소스인가 — 켜져 있고 종료일 전 */
export function isSourceActive(source: Pick<WikiSource, 'enabled' | 'endsAt'>, now = new Date()): boolean {
  return source.enabled && (source.endsAt === null || source.endsAt.getTime() > now.getTime());
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 사이트맵에는 있는데 실제로는 없는 페이지(노션 DB 성격의 「안내 사항」 등, 실측 404) — 실패가 아니라 「없음」 */
class PageGoneError extends Error {}

async function fetchPage(fetchImpl: FetchTextLike, url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xml;q=0.9,*/*;q=0.5' }, signal: controller.signal });
    if (response.status === 404 || response.status === 410) throw new PageGoneError(`HTTP ${response.status}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

export interface CrawlResult {
  sourceId: number;
  total: number;
  fetched: number;
  changed: number;
  removed: number;
  /** 사이트맵엔 있지만 404 — 실패로 세지 않는다 */
  gone: number;
  failed: number;
}

/**
 * 소스 하나 수집 — 사이트맵(없으면 메인 페이지 링크)으로 페이지 목록을 만들고 순차로 읽어 해시가 바뀐 것만 갱신한다.
 * 페이지 목록 자체를 못 얻으면 실패로 보고 기존 데이터를 그대로 둔다. 개별 페이지 실패는 건너뛰고(기존 내용 유지) 센다.
 */
/** 같은 소스를 동시에 두 번 읽지 않는다 — 워커 주기와 「지금 수집」이 겹칠 수 있다 */
const crawling = new Set<number>();

export async function crawlSource(prisma: PrismaClient, sourceId: number, fetchImpl: FetchTextLike = fetch, now = new Date()): Promise<CrawlResult> {
  const source = await prisma.wikiSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new ServiceError('NOT_FOUND', '위키 소스를 찾을 수 없습니다.');
  if (crawling.has(sourceId)) throw new ServiceError('CONFLICT', '이미 수집 중입니다. 잠시 후 다시 시도해주세요.');
  crawling.add(sourceId);
  try {
    return await crawlSourceInner(prisma, source, fetchImpl, now);
  } finally {
    crawling.delete(sourceId);
  }
}

/** 「지금 수집」 — 페이지 수만큼 걸리므로(1초에 1페이지) 요청은 바로 돌려주고 뒤에서 돈다. 상태는 lastCrawledAt·lastError 로 */
export async function startCrawl(prisma: PrismaClient, sourceId: number, fetchImpl: FetchTextLike = fetch) {
  const source = await prisma.wikiSource.findUnique({ where: { id: sourceId }, select: { id: true } });
  if (!source) throw new ServiceError('NOT_FOUND', '위키 소스를 찾을 수 없습니다.');
  if (crawling.has(sourceId)) throw new ServiceError('CONFLICT', '이미 수집 중입니다.');
  void crawlSource(prisma, sourceId, fetchImpl).catch(() => {
    /* recordFailure 가 남겼다 */
  });
  return { started: true as const };
}

export function isCrawling(sourceId: number): boolean {
  return crawling.has(sourceId);
}

async function crawlSourceInner(prisma: PrismaClient, source: WikiSource, fetchImpl: FetchTextLike, now: Date): Promise<CrawlResult> {
  const sourceId = source.id;

  let urls: string[];
  try {
    urls = await discoverPages(source.baseUrl, fetchImpl);
    if (urls.length === 0) throw new Error('페이지 목록이 비어 있습니다.');
  } catch (error) {
    await recordFailure(prisma, source, `페이지 목록 수집 실패: ${error instanceof Error ? error.message : String(error)}`);
    throw new ServiceError('INVALID_INPUT', `페이지 목록을 가져오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
  urls = urls.slice(0, source.maxPages);

  const existing = new Map((await prisma.wikiPage.findMany({ where: { sourceId }, select: { url: true, hash: true } })).map((row) => [row.url, row.hash]));
  const result: CrawlResult = { sourceId, total: urls.length, fetched: 0, changed: 0, removed: 0, gone: 0, failed: 0 };
  const seen = new Set<string>();

  for (const [index, url] of urls.entries()) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    try {
      const html = await fetchPage(fetchImpl, encodePageUrl(url));
      const { title, text } = htmlToText(html);
      const content = text.slice(0, MAX_CONTENT);
      const hash = hashContent(content);
      seen.add(url);
      result.fetched++;
      if (existing.get(url) === hash) {
        await prisma.wikiPage.updateMany({ where: { sourceId, url }, data: { fetchedAt: now } });
        continue;
      }
      result.changed++;
      await prisma.wikiPage.upsert({
        where: { sourceId_url: { sourceId, url } },
        update: { title: title.slice(0, 200) || url, content, hash, fetchedAt: now, changedAt: now },
        create: { sourceId, url, title: title.slice(0, 200) || url, content, hash, fetchedAt: now, changedAt: now },
      });
    } catch (error) {
      if (error instanceof PageGoneError) {
        //  없는 페이지 — 저장돼 있었다면 아래 정리에서 지워진다
        result.gone++;
        continue;
      }
      //  개별 실패는 기존 내용을 남긴다 — 다음 수집에서 다시 시도
      result.failed++;
      if (existing.has(url)) seen.add(url);
    }
  }

  //  목록에서 사라졌고 이번에 읽지도 못한 페이지만 지운다
  const stale = [...existing.keys()].filter((url) => !seen.has(url));
  if (stale.length > 0) {
    const deleted = await prisma.wikiPage.deleteMany({ where: { sourceId, url: { in: stale } } });
    result.removed = deleted.count;
  }

  await prisma.wikiSource.update({ where: { id: sourceId }, data: { lastCrawledAt: now, lastError: result.failed > 0 ? `${result.failed}개 페이지를 읽지 못했습니다 (다음 수집에서 재시도)` : null, consecutiveFailures: 0 } });
  return result;
}

async function discoverPages(baseUrl: string, fetchImpl: FetchTextLike): Promise<string[]> {
  try {
    const xml = await fetchPage(fetchImpl, new URL('/sitemap.xml', baseUrl).toString());
    const urls = parseSitemap(xml, baseUrl);
    if (urls.length > 0) return urls;
  } catch {
    /* 사이트맵이 없으면 메인 페이지 링크로 */
  }
  const html = await fetchPage(fetchImpl, baseUrl);
  const base = new URL(baseUrl);
  return [...new Set([`${base.origin}${base.pathname.replace(/\/+$/, '') || '/'}`, ...extractInternalLinks(html, baseUrl)])];
}

async function recordFailure(prisma: PrismaClient, source: WikiSource, message: string) {
  const failures = source.consecutiveFailures + 1;
  await prisma.wikiSource.update({ where: { id: source.id }, data: { lastError: message.slice(0, 500), consecutiveFailures: failures } });
  if (failures === FAILURES_TO_NOTIFY) {
    void notifyAdmins(prisma, 'ERROR', {
      title: `위키 수집 실패: ${source.name}`,
      lines: [`${failures}회 연속 실패했습니다. 기존 페이지로 답변은 계속됩니다.`, `오류: ${message.slice(0, 300)}`],
      fields: [{ name: '소스', value: `${source.name} (${source.baseUrl})` }, { name: '오류', value: message.slice(0, 500) }],
    });
  }
}

/** 워커가 1시간마다 — 켜져 있고 종료 전이며 마지막 수집이 오래된 소스만 */
export async function crawlDue(prisma: PrismaClient, fetchImpl: FetchTextLike = fetch, now = new Date()) {
  const sources = await prisma.wikiSource.findMany({ where: { enabled: true } });
  const results: CrawlResult[] = [];
  for (const source of sources) {
    if (!isSourceActive(source, now)) continue;
    if (source.lastCrawledAt && now.getTime() - source.lastCrawledAt.getTime() < CRAWL_INTERVAL_MS - 5 * 60_000) continue;
    try {
      results.push(await crawlSource(prisma, source.id, fetchImpl, now));
    } catch {
      /* recordFailure 가 남겼다 */
    }
  }
  return results;
}

/* ── 2단계: 검색·한도 (#309) ── */

/** AgentUsage.entryName — 위키 답변 사용량 구분. 에이전트 한도 계산에서는 뺀다 */
export const WIKI_ENTRY_NAME = 'wiki';
/** 검색 청크 길이·개수 */
export const CHUNK_CHARS = 900;
export const SEARCH_TOP = 5;
/** 같은 질문 캐시 */
export const ANSWER_CACHE_MS = 10 * 60_000;
export const MAX_CONCURRENT_PER_CHANNEL = 1;
export const MAX_CONCURRENT_GLOBAL = 4;

/** 스트리머가 명령어에 연결할 수 있는 소스 */
export async function listActiveSources(prisma: PrismaClient, now = new Date()) {
  const rows = await prisma.wikiSource.findMany({ where: { enabled: true }, select: { id: true, name: true, endsAt: true, enabled: true }, orderBy: { id: 'asc' } });
  return rows.filter((row) => isSourceActive(row, now)).map((row) => ({ id: row.id, name: row.name }));
}

/* 청크 */

export interface WikiChunk {
  pageId: number;
  url: string;
  title: string;
  /** 페이지 제목 + 마지막 소제목 — 모델에 위치를 알려준다 */
  heading: string;
  text: string;
}

/** 페이지 텍스트를 소제목 경계로 자르고, 긴 절은 CHUNK_CHARS 단위로 더 자른다 */
export function chunkPage(page: { id: number; url: string; title: string; content: string }): WikiChunk[] {
  const chunks: WikiChunk[] = [];
  let heading = page.title;
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    buffer = [];
    if (!text) return;
    for (let i = 0; i < text.length; i += CHUNK_CHARS) {
      chunks.push({ pageId: page.id, url: page.url, title: page.title, heading, text: text.slice(i, i + CHUNK_CHARS) });
    }
  };
  for (const line of page.content.split('\n')) {
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) {
      flush();
      heading = h[1].trim() === page.title ? page.title : `${page.title} › ${h[1].trim()}`;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}

/** 검색어 토큰 — 공백·구두점으로 나눈 어절 + 한글 2글자 조각(조사·어미가 붙어도 맞도록) */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().split(/[\s,.!?()[\]{}"'“”‘’·…:;/\\|<>~`^*+=_-]+/).filter((w) => w.length > 0);
  const tokens = new Set<string>();
  for (const word of words) {
    tokens.add(word);
    if (/[가-힣]/.test(word) && word.length >= 3) {
      for (let i = 0; i + 2 <= word.length; i++) tokens.add(word.slice(i, i + 2));
    }
  }
  return [...tokens];
}

/** 질문에 맞는 청크 상위 N — 단순 tf·idf 근사. 제목·소제목에 맞으면 가중 */
export function searchChunks(chunks: WikiChunk[], question: string, top = SEARCH_TOP): WikiChunk[] {
  const terms = tokenize(question).filter((t) => t.length >= 2);
  if (terms.length === 0 || chunks.length === 0) return [];
  const docFreq = new Map<string, number>();
  const lowered = chunks.map((chunk) => ({ chunk, body: chunk.text.toLowerCase(), head: chunk.heading.toLowerCase() }));
  for (const term of terms) {
    docFreq.set(term, lowered.filter((entry) => entry.body.includes(term) || entry.head.includes(term)).length);
  }
  const scored = lowered.map((entry) => {
    let score = 0;
    for (const term of terms) {
      const df = docFreq.get(term) ?? 0;
      if (df === 0) continue;
      const idf = Math.log(1 + chunks.length / df);
      const tf = entry.body.split(term).length - 1;
      score += idf * (Math.min(tf, 5) + (entry.head.includes(term) ? 3 : 0));
    }
    return { chunk: entry.chunk, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
    .map((entry) => entry.chunk);
}

/** 소스별 청크 캐시 — 마지막 수집 시각이 바뀌면 다시 만든다 */
const chunkCache = new Map<number, { crawledAt: number; chunks: WikiChunk[]; titles: { title: string; url: string }[] }>();

export async function loadChunks(prisma: PrismaClient, sourceId: number, lastCrawledAt: Date | null) {
  const stamp = lastCrawledAt?.getTime() ?? 0;
  const cached = chunkCache.get(sourceId);
  if (cached && cached.crawledAt === stamp) return cached;
  const pages = await prisma.wikiPage.findMany({ where: { sourceId }, select: { id: true, url: true, title: true, content: true }, orderBy: { url: 'asc' } });
  const entry = { crawledAt: stamp, chunks: pages.flatMap(chunkPage), titles: pages.map((page) => ({ title: page.title, url: page.url })) };
  chunkCache.set(sourceId, entry);
  return entry;
}

/* 한도·쿨타임·캐시 — API 메모리. 재시작하면 초기화돼도 무방(길어야 30분) */

const cooldowns = new Map<string, number>();
const answerCache = new Map<string, { expiresAt: number; message: string; messages?: string[] }>();
const inFlight = new Map<number, number>();
let inFlightGlobal = 0;

export function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/[\s?.!~]+/g, ' ').trim();
}

const KST = 'Asia/Seoul';
function kstStartOfToday(now: Date): Date {
  const key = now.toLocaleDateString('sv-SE', { timeZone: KST });
  return new Date(`${key}T00:00:00+09:00`);
}

export type GuardResult = { ok: true } | { ok: false; message: string; notify?: 'global-limit' };

/**
 * 답변 전 판정 순서: 캐시(호출부가 먼저 본다) → 쿨타임 → 일일 상한 → 동시 처리.
 * 캐시 응답은 아무것도 소모하지 않는다. 쿨타임은 성공한 뒤(markAnswered)에만 건다
 */
export async function guardAnswer(
  prisma: PrismaClient,
  source: Pick<WikiSource, 'id' | 'viewerCooldownMinutes' | 'perChannelDaily' | 'globalDaily'>,
  input: { userId: number; senderChannelId: string },
  now = new Date(),
): Promise<GuardResult> {
  const key = `${input.userId}:${input.senderChannelId}`;
  const until = cooldowns.get(key);
  if (until !== undefined && until > now.getTime()) {
    const minutes = Math.max(1, Math.ceil((until - now.getTime()) / 60_000));
    return { ok: false, message: `${minutes}분 뒤에 다시 물어봐 주세요.` };
  }
  const since = kstStartOfToday(now);
  if (source.perChannelDaily > 0) {
    const used = await prisma.agentUsage.count({ where: { userId: input.userId, entryName: WIKI_ENTRY_NAME, createdAt: { gte: since } } });
    if (used >= source.perChannelDaily) return { ok: false, message: '오늘 이 채널의 질문 한도에 도달했습니다. 내일 다시 물어봐 주세요.' };
  }
  if (source.globalDaily > 0) {
    const used = await prisma.agentUsage.count({ where: { entryName: WIKI_ENTRY_NAME, createdAt: { gte: since } } });
    if (used >= source.globalDaily) return { ok: false, message: '오늘 위키 답변 한도에 도달했습니다. 내일 다시 물어봐 주세요.', notify: used === source.globalDaily ? 'global-limit' : undefined };
  }
  if ((inFlight.get(input.userId) ?? 0) >= MAX_CONCURRENT_PER_CHANNEL || inFlightGlobal >= MAX_CONCURRENT_GLOBAL) {
    return { ok: false, message: '지금 다른 질문을 처리하고 있습니다. 잠시 후 다시 물어봐 주세요.' };
  }
  return { ok: true };
}

export function beginAnswer(userId: number) {
  inFlight.set(userId, (inFlight.get(userId) ?? 0) + 1);
  inFlightGlobal++;
}

export function endAnswer(userId: number) {
  inFlight.set(userId, Math.max(0, (inFlight.get(userId) ?? 1) - 1));
  inFlightGlobal = Math.max(0, inFlightGlobal - 1);
}

/** 성공한 답변 뒤 — 시청자 쿨타임 시작, 캐시 저장 */
export function markAnswered(source: Pick<WikiSource, 'id' | 'viewerCooldownMinutes'>, input: { userId: number; senderChannelId: string; question: string }, answer: { message: string; messages?: string[] }, now = new Date()) {
  if (source.viewerCooldownMinutes > 0) cooldowns.set(`${input.userId}:${input.senderChannelId}`, now.getTime() + source.viewerCooldownMinutes * 60_000);
  answerCache.set(`${source.id}:${input.userId}:${normalizeQuestion(input.question)}`, { expiresAt: now.getTime() + ANSWER_CACHE_MS, ...answer });
}

export function cachedAnswer(sourceId: number, userId: number, question: string, now = new Date()) {
  const hit = answerCache.get(`${sourceId}:${userId}:${normalizeQuestion(question)}`);
  if (!hit) return null;
  if (hit.expiresAt <= now.getTime()) {
    answerCache.delete(`${sourceId}:${userId}:${normalizeQuestion(question)}`);
    return null;
  }
  return { message: hit.message, messages: hit.messages };
}

/** 테스트용 — 메모리 상태 초기화 */
export function resetAnswerState() {
  cooldowns.clear();
  answerCache.clear();
  inFlight.clear();
  inFlightGlobal = 0;
  chunkCache.clear();
}
