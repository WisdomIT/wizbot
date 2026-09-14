import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../notify', () => ({ notifyAdmins: vi.fn().mockResolvedValue({ mailSent: false, discordSent: false }) }));

import { notifyAdmins } from '../notify';
import { crawlDue, crawlSource, isSourceActive, saveSource } from '../wiki';

const NOW = new Date('2026-09-14T03:00:00Z');
const SOURCE = {
  id: 1, name: '봉누도 2 위키', baseUrl: 'https://bongnudo.super.site/', enabled: true, endsAt: null as Date | null, maxPages: 150,
  viewerCooldownMinutes: 30, perChannelDaily: 200, globalDaily: 2000, lastCrawledAt: null as Date | null, lastError: null as string | null, consecutiveFailures: 0,
  createdAt: NOW, updatedAt: NOW,
};

function createPrisma(existingPages: { url: string; hash: string }[] = [], source = SOURCE) {
  const wikiSource = {
    findUnique: vi.fn().mockResolvedValue(source),
    findMany: vi.fn().mockResolvedValue([source]),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 9, ...data })),
  };
  const wikiPage = {
    findMany: vi.fn().mockResolvedValue(existingPages),
    upsert: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  return { prisma: { wikiSource, wikiPage } as unknown as PrismaClient, wikiSource, wikiPage };
}

const page = (title: string, body: string) => `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
const sitemap = (...paths: string[]) => `<urlset>${paths.map((p) => `<url><loc>https://bongnudo.super.site${p}</loc></url>`).join('')}</urlset>`;

function fetchOf(routes: Record<string, string | number>) {
  return vi.fn(async (url: string) => {
    const path = decodeURIComponent(new URL(url).pathname);
    const hit = routes[path];
    if (typeof hit === 'number') return { ok: false, status: hit, text: async () => '' };
    if (hit === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => hit };
  });
}

describe('crawlSource (#309)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('사이트맵으로 페이지를 찾아 순차로 읽고, 새 페이지는 upsert·같은 해시는 fetchedAt 만·사라진 페이지는 삭제', async () => {
    const fetchImpl = fetchOf({
      '/sitemap.xml': sitemap('/', '/낚시', '/벌목'),
      '/': page('봉누도', '메인'),
      '/낚시': page('낚시', '낚시 안내'),
      '/벌목': page('벌목', '벌목 안내'),
    });
    //  낚시는 이전과 같은 내용(해시 동일), 옛날페이지는 목록에서 사라짐
    const sameHash = (await import('../../lib/wiki')).hashContent('# 낚시\n낚시 안내');
    const { prisma, wikiPage, wikiSource } = createPrisma([
      { url: 'https://bongnudo.super.site/낚시', hash: sameHash },
      { url: 'https://bongnudo.super.site/옛날페이지', hash: 'x' },
    ]);
    const result = await crawlSource(prisma, 1, fetchImpl, NOW);
    expect(result).toEqual({ sourceId: 1, total: 3, fetched: 3, changed: 2, removed: 0, gone: 0, failed: 0 });
    expect(wikiPage.upsert).toHaveBeenCalledTimes(2);
    expect(wikiPage.upsert.mock.calls[0][0].create).toMatchObject({ url: 'https://bongnudo.super.site/', title: '봉누도', content: '# 봉누도\n메인' });
    expect(wikiPage.updateMany).toHaveBeenCalledWith({ where: { sourceId: 1, url: 'https://bongnudo.super.site/낚시' }, data: { fetchedAt: NOW } });
    expect(wikiPage.deleteMany).toHaveBeenCalledWith({ where: { sourceId: 1, url: { in: ['https://bongnudo.super.site/옛날페이지'] } } });
    expect(wikiSource.update).toHaveBeenLastCalledWith({ where: { id: 1 }, data: { lastCrawledAt: NOW, lastError: null, consecutiveFailures: 0 } });
    //  요청 주소는 인코딩된다
    expect(fetchImpl.mock.calls.map((call) => call[0])).toContain('https://bongnudo.super.site/%eb%82%9a%ec%8b%9c');
  }, 15_000);

  it('개별 페이지 실패는 기존 내용을 남기고 세기만 한다', async () => {
    const fetchImpl = fetchOf({ '/sitemap.xml': sitemap('/', '/낚시'), '/': page('봉누도', '메인'), '/낚시': 500 });
    const { prisma, wikiPage } = createPrisma([{ url: 'https://bongnudo.super.site/낚시', hash: 'old' }]);
    const result = await crawlSource(prisma, 1, fetchImpl, NOW);
    expect(result).toMatchObject({ fetched: 1, failed: 1, removed: 0 });
    expect(wikiPage.deleteMany).not.toHaveBeenCalled();
  });

  it('404 페이지는 실패가 아니라 「없음」 — 저장돼 있었다면 지우고 오류 문구도 남기지 않는다 (실측: 사이트맵의 「안내 사항」 7개)', async () => {
    const fetchImpl = fetchOf({ '/sitemap.xml': sitemap('/', '/ems-안내-사항'), '/': page('봉누도', '메인'), '/ems-안내-사항': 404 });
    const { prisma, wikiPage, wikiSource } = createPrisma([{ url: 'https://bongnudo.super.site/ems-안내-사항', hash: 'old' }]);
    const result = await crawlSource(prisma, 1, fetchImpl, NOW);
    expect(result).toMatchObject({ fetched: 1, gone: 1, failed: 0, removed: 0 });
    expect(wikiPage.deleteMany).toHaveBeenCalledWith({ where: { sourceId: 1, url: { in: ['https://bongnudo.super.site/ems-안내-사항'] } } });
    expect(wikiSource.update).toHaveBeenLastCalledWith({ where: { id: 1 }, data: { lastCrawledAt: NOW, lastError: null, consecutiveFailures: 0 } });
  });

  it('사이트맵이 없으면 메인 페이지 링크로 찾는다', async () => {
    const fetchImpl = fetchOf({
      '/sitemap.xml': 404,
      '/': `<html><head><title>봉누도</title></head><body><main><a href="/낚시">낚시</a><a href="/api">x</a><p>메인</p></main></body></html>`,
      '/낚시': page('낚시', '안내'),
    });
    const { prisma } = createPrisma();
    const result = await crawlSource(prisma, 1, fetchImpl, NOW);
    expect(result).toMatchObject({ total: 2, fetched: 2 });
  });

  it('페이지 목록 자체를 못 얻으면 실패로 기록하고 3회째에 운영자 알림', async () => {
    const fetchImpl = fetchOf({ '/sitemap.xml': 503, '/': 503 });
    const { prisma, wikiSource } = createPrisma([], { ...SOURCE, consecutiveFailures: 2 });
    await expect(crawlSource(prisma, 1, fetchImpl, NOW)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(wikiSource.update.mock.calls[0][0].data).toMatchObject({ consecutiveFailures: 3 });
    expect(notifyAdmins).toHaveBeenCalledWith(prisma, 'ERROR', expect.objectContaining({ title: '위키 수집 실패: 봉누도 2 위키' }));
  });
});

describe('crawlDue / isSourceActive / saveSource', () => {
  it('종료일이 지났거나 꺼졌거나 최근에 수집했으면 건너뛴다', async () => {
    expect(isSourceActive({ enabled: true, endsAt: null }, NOW)).toBe(true);
    expect(isSourceActive({ enabled: true, endsAt: new Date('2026-09-13T00:00:00Z') }, NOW)).toBe(false);
    expect(isSourceActive({ enabled: false, endsAt: null }, NOW)).toBe(false);

    const recent = { ...SOURCE, lastCrawledAt: new Date(NOW.getTime() - 10 * 60_000) };
    const { prisma } = createPrisma([], recent);
    const fetchImpl = fetchOf({});
    await expect(crawlDue(prisma, fetchImpl, NOW)).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('주소는 origin + 경로로 정규화, 잘못된 주소는 거부', async () => {
    const { prisma, wikiSource } = createPrisma();
    await saveSource(prisma, null, { ...SOURCE, baseUrl: 'https://bongnudo.super.site' });
    expect(wikiSource.create.mock.calls[0][0].data.baseUrl).toBe('https://bongnudo.super.site/');
    await expect(saveSource(prisma, null, { ...SOURCE, baseUrl: 'bongnudo' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
