import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isYoutubeChannelId, parseCafeSlug, parseClubInfo, uploadsPlaylistId } from '../../lib/cafe';
import { completeAction, decodeHtml, getBotSessionMasked, linkCafe, markJoined, requestAction, requestJoin, setBotSession, setYoutube } from '../cafe';

describe('parseCafeSlug', () => {
  it.each([
    ['https://cafe.naver.com/bighead033', 'bighead033'],
    ['https://cafe.naver.com/bighead033/12345', 'bighead033'],
    ['cafe.naver.com/mamwa?iframe_url=/x', 'mamwa'],
    ['https://m.cafe.naver.com/ca-fe/mamwa', 'ca-fe'],
    ['bighead033', 'bighead033'],
  ])('%s → %s', (input, slug) => {
    expect(parseCafeSlug(input)).toBe(slug);
  });
  it('다른 도메인·빈 값은 null', () => {
    expect(parseCafeSlug('https://example.com/x')).toBeNull();
    expect(parseCafeSlug('  ')).toBeNull();
    expect(parseCafeSlug('한글주소')).toBeNull();
  });
});

describe('parseClubInfo — 실측 HTML 형태 (2026-08-29)', () => {
  it('g_sClubId 와 title 에서 뽑는다', () => {
    const html = '<title>빅대숲 (빅헤드 대가리 숲) : 네이버 카페</title><script>var g_sClubId = "29569242";</script>';
    expect(parseClubInfo(html)).toEqual({ clubId: '29569242', cafeName: '빅대숲 (빅헤드 대가리 숲)' });
  });
  it('g_sClubId 가 없으면 clubid= 링크로', () => {
    expect(parseClubInfo('<a href="/ArticleList.nhn?clubid=12345678">')).toMatchObject({ clubId: '12345678' });
  });
  it('둘 다 없으면 null', () => {
    expect(parseClubInfo('<html>nothing</html>')).toBeNull();
  });
});

describe('decodeHtml — 네이버 페이지는 EUC-KR', () => {
  it('meta charset 이 KSC5601/MS949/euc-kr 이면 euc-kr 로, 없으면 utf-8', () => {
    const utf8 = new TextEncoder().encode('<title>한글</title>').buffer as ArrayBuffer;
    expect(decodeHtml(utf8)).toContain('한글');
    // EUC-KR 로 인코딩된 "한글" = C7 D1 B1 DB
    const eucKr = new Uint8Array([...new TextEncoder().encode('<meta content="text/html;charset=KSC5601"><title>'), 0xc7, 0xd1, 0xb1, 0xdb, ...new TextEncoder().encode('</title>')]).buffer as ArrayBuffer;
    expect(decodeHtml(eucKr)).toContain('한글');
  });
});

describe('유튜브', () => {
  it('채널 ID 는 UC + 22자', () => {
    expect(isYoutubeChannelId('UCxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    expect(isYoutubeChannelId('UUxxxxxxxxxxxxxxxxxxxxxx')).toBe(false);
    expect(isYoutubeChannelId('UC short')).toBe(false);
  });
  it('업로드 재생목록은 UC → UU', () => {
    expect(uploadsPlaylistId('UCabc')).toBe('UUabc');
  });
});

function createPrisma() {
  const cafeIntegration = {
    findUnique: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockImplementation(async ({ create, update }: { create: object; update: object }) => ({ id: 1, ...create, ...update })),
    update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 1, ...data })),
  };
  const naverBotSession = {
    findUnique: vi.fn().mockResolvedValue({ id: 1, displayName: '봇', nidAut: 'AUT1234', nidSes: 'SES5678', updatedAt: new Date(), checkedAt: null, valid: null, checkMessage: null }),
    upsert: vi.fn().mockImplementation(async ({ create }: { create: object }) => create),
  };
  return { prisma: { cafeIntegration, naverBotSession } as unknown as PrismaClient, cafeIntegration, naverBotSession };
}

const okFetch = (html: string) => async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(html).buffer as ArrayBuffer });

describe('linkCafe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('주소를 파싱해 카페 페이지를 받고 clubid·이름을 저장한다', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    const fetchImpl = vi.fn(okFetch('<title>Test Cafe : 네이버 카페</title>var g_sClubId = "111";'));
    const row = await linkCafe(prisma, 7, 'https://cafe.naver.com/testcafe', fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('https://cafe.naver.com/testcafe');
    expect(row).toMatchObject({ clubId: '111', cafeName: 'Test Cafe', cafeUrl: 'https://cafe.naver.com/testcafe' });
    expect(cafeIntegration.upsert.mock.calls[0][0].create).not.toHaveProperty('status');
  });

  it('다른 카페로 바꾸면 연동 상태를 처음으로 되돌린다', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ userId: 7, clubId: '111', status: 'PERMISSION_OK' });
    await linkCafe(prisma, 7, 'other', okFetch('g_sClubId = "222"'));
    expect(cafeIntegration.upsert.mock.calls[0][0].update).toMatchObject({ clubId: '222', status: 'NONE', pendingAction: null });
  });

  it('같은 카페면 상태를 건드리지 않는다', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ userId: 7, clubId: '111', status: 'PERMISSION_OK' });
    await linkCafe(prisma, 7, 'same', okFetch('g_sClubId = "111"'));
    expect(cafeIntegration.upsert.mock.calls[0][0].update).not.toHaveProperty('status');
  });

  it('잘못된 주소·못 여는 페이지·정보 없음은 각각 다른 에러', async () => {
    const { prisma } = createPrisma();
    await expect(linkCafe(prisma, 7, 'https://example.com')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(linkCafe(prisma, 7, 'x-cafe', async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(linkCafe(prisma, 7, 'x-cafe', okFetch('<html>no id</html>'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('requestJoin — 운영자에게 가입 요청 (보안문자 때문에 봇이 직접 못 한다)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('상태를 JOIN_REQUESTED 로, 워커 작업(pendingAction)은 만들지 않는다', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ id: 1, clubId: '1', status: 'NONE' });
    await requestJoin(prisma, 7);
    const data = cafeIntegration.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'JOIN_REQUESTED' });
    expect(data).not.toHaveProperty('pendingAction');
  });
  it('이미 요청했으면 CONFLICT', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ id: 1, clubId: '1', status: 'JOIN_REQUESTED' });
    await expect(requestJoin(prisma, 7)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('운영자의 「가입 완료」 → JOINED', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ id: 1, status: 'JOIN_REQUESTED' });
    await expect(markJoined(prisma, 1)).resolves.toMatchObject({ status: 'JOINED' });
  });
});

describe('requestAction / completeAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('카페 연결 전엔 요청할 수 없다', async () => {
    const { prisma } = createPrisma();
    await expect(requestAction(prisma, 7, 'VERIFY')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('처리 중인 요청이 있으면 CONFLICT', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ clubId: '1', pendingAction: 'VERIFY' });
    await expect(requestAction(prisma, 7, 'VERIFY')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('봇 세션이 없으면 FORBIDDEN — 관리자가 먼저 등록해야 한다', async () => {
    const { prisma, cafeIntegration, naverBotSession } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ clubId: '1', pendingAction: null });
    naverBotSession.findUnique.mockResolvedValue(null);
    await expect(requestAction(prisma, 7, 'VERIFY')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('정상이면 pendingAction 을 세우고, 워커의 완료 보고가 지운다', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    cafeIntegration.findUnique.mockResolvedValue({ clubId: '1', pendingAction: null });
    await requestAction(prisma, 7, 'VERIFY');
    expect(cafeIntegration.update.mock.calls[0][0].data).toMatchObject({ pendingAction: 'VERIFY' });
    await completeAction(prisma, 1, { status: 'PERMISSION_OK', message: null });
    expect(cafeIntegration.update.mock.calls[1][0].data).toEqual({ pendingAction: null, status: 'PERMISSION_OK', statusMessage: null });
  });
});

describe('봇 세션', () => {
  it('어드민 화면엔 쿠키 끝 4자만', async () => {
    const { prisma } = createPrisma();
    await expect(getBotSessionMasked(prisma)).resolves.toMatchObject({ nidAut: '…1234', nidSes: '…5678', displayName: '봇' });
  });
  it('빈 값은 거부, 저장 시 검사 결과를 초기화', async () => {
    const { prisma, naverBotSession } = createPrisma();
    await expect(setBotSession(prisma, { displayName: '', nidAut: 'a', nidSes: 'b' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await setBotSession(prisma, { displayName: ' 봇 ', nidAut: ' a ', nidSes: 'b' });
    expect(naverBotSession.upsert.mock.calls[0][0].create).toMatchObject({ displayName: '봇', nidAut: 'a', valid: null, checkedAt: null });
  });
});

describe('setYoutube', () => {
  it('채널 ID 형식 검증, 빈 값은 해제', async () => {
    const { prisma, cafeIntegration } = createPrisma();
    await expect(setYoutube(prisma, 7, { channelId: 'bad', width: 560, height: 315 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await setYoutube(prisma, 7, { channelId: '  ', width: 560, height: 315 });
    expect(cafeIntegration.upsert.mock.calls[0][0].update).toMatchObject({ youtubeChannelId: null });
  });
});
