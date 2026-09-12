import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CafeSnapshot } from '../../lib/cafeLayout';
import { completeGateFetch, evaluateLive, listActive, reportSave, requestGateRefresh } from '../cafe';

const live: CafeSnapshot = { live: true, title: '제목', category: '롤', viewers: 120, openedAt: '2026-08-29T20:00:00+09:00', thumbnailUrl: null };
const now = new Date('2026-08-29T11:10:00Z');

function db(row: Record<string, unknown>) {
  const update = vi.fn().mockResolvedValue({});
  const findUnique = vi.fn().mockResolvedValue({
    lastSnapshot: null, lastSavedAt: null, lastViewerBucket: null, lastSaveSerial: 3, gateSerial: 3, saveAttemptedAt: null,
    user: { channelId: 'chan' },
    ...row,
  });
  return { prisma: { cafeIntegration: { update, findUnique } } as unknown as PrismaClient, update };
}

describe('evaluateLive — 저장 판정과 일련번호 (#9 PR3b)', () => {
  beforeEach(() => { process.env.PUBLIC_SITE_URL = 'https://bot.test'; });

  it('첫 저장: 일련번호 +1, 스냅샷·구간·시각 기록, 새 이미지 주소', async () => {
    const { prisma, update } = db({});
    const r = await evaluateLive(prisma, 1, live, now);
    expect(r.save).toEqual({ reason: 'first', serial: 4, src: 'https://bot.test/cafe/chan.png?v=4' });
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { lastSaveSerial: 4, lastSnapshot: live, lastSavedAt: now, lastViewerBucket: 100, saveAttemptedAt: now } });
  });
  it('변화 없으면 저장 없음 (DB 도 안 건드림)', async () => {
    const { prisma, update } = db({ lastSnapshot: live, lastSavedAt: new Date(now.getTime() - 30_000), lastViewerBucket: 100 });
    expect((await evaluateLive(prisma, 1, live, now)).save).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
  it('방송 종료로 바뀌면 즉시', async () => {
    const { prisma } = db({ lastSnapshot: live, lastSavedAt: now, lastViewerBucket: 100 });
    const r = await evaluateLive(prisma, 1, { ...live, live: false, viewers: 0 }, now);
    expect(r.save).toMatchObject({ reason: 'state', serial: 4 });
  });
  it('대문에 못 써진 일련번호(gateSerial < lastSaveSerial)는 1분마다 같은 번호로 재시도', async () => {
    const attempted = new Date(now.getTime() - 61_000);
    const { prisma, update } = db({ lastSnapshot: live, lastSavedAt: attempted, lastViewerBucket: 100, gateSerial: 2, saveAttemptedAt: attempted });
    const r = await evaluateLive(prisma, 1, live, now);
    expect(r.save).toMatchObject({ reason: 'retry', serial: 3 });
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { saveAttemptedAt: now } });
    const soon = db({ lastSnapshot: live, lastSavedAt: attempted, lastViewerBucket: 100, gateSerial: 2, saveAttemptedAt: new Date(now.getTime() - 10_000) });
    expect((await evaluateLive(soon.prisma, 1, live, now)).save).toBeNull();
  });
});

describe('reportSave', () => {
  it('성공: gateSerial·gateHtml 갱신, 실패(missing): 동작 중지 + 자리 초기화', async () => {
    const { prisma, update } = db({});
    await reportSave(prisma, 1, { ok: true, serial: 4, html: '<p>x</p>' });
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { gateSerial: 4, gateHtml: '<p>x</p>', gateUpdatedAt: expect.any(Date), statusMessage: null } });
    await reportSave(prisma, 1, { ok: false, message: '사라짐', missing: true, html: '<p></p>' });
    expect(update).toHaveBeenLastCalledWith({ where: { id: 1 }, data: { statusMessage: '사라짐', status: 'PERMISSION_OK', gatePicks: { image: null, youtube: null }, gateHtml: '<p></p>' } });
  });
});

const CHANNEL = 'd9c571e0ecae37fec31711735f95c8f4';
const MARKED = `<p><img src="https://bot.test/cafe/${CHANNEL}.png?v=233" alt="chzzk-automation" width="836" height="300"></p>`;

describe('중지 상태 복구 (#294)', () => {
  it('listActive — PERMISSION_OK 여도 대문에 블록이 있으면 ACTIVE 로 되돌리고 폴링 대상에 넣는다', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 1, clubId: 'c1', cafeName: '카페', gateHtml: MARKED, status: 'PERMISSION_OK', user: { channelId: CHANNEL, channelName: '마뫄' } },
      { id: 2, clubId: 'c2', cafeName: null, gateHtml: '<p>블록 없음</p>', status: 'PERMISSION_OK', user: { channelId: 'x', channelName: 'y' } },
      { id: 3, clubId: 'c3', cafeName: null, gateHtml: MARKED, status: 'ACTIVE', user: { channelId: 'z', channelName: 'w' } },
    ]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { cafeIntegration: { findMany, updateMany } } as unknown as PrismaClient;
    const rows = await listActive(prisma);
    expect(rows.map((r) => [r.id, r.revived])).toEqual([[1, true], [3, false]]);
    expect(findMany.mock.calls[0][0].where.status).toEqual({ in: ['ACTIVE', 'PERMISSION_OK'] });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: [1] } }, data: { status: 'ACTIVE', statusMessage: null } });
  });

  it('completeGateFetch — 바뀌었으면 고른 자리를 버리되 이유를 남기고, 블록이 있으면 중지 상태를 되돌린다', async () => {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({ gateHtml: '<p>옛날</p>', gatePicks: { image: { path: [0], w: 1, h: 1 }, youtube: null }, status: 'PERMISSION_OK' });
    const prisma = { cafeIntegration: { update, findUnique } } as unknown as PrismaClient;
    const result = await completeGateFetch(prisma, 1, { html: MARKED, render: null });
    expect(result).toEqual({ changed: true, reset: true, reactivated: true });
    expect(update.mock.calls[0][0].data).toMatchObject({
      gatePicks: { image: null, youtube: null },
      statusMessage: '대문이 바뀌어 고른 자리를 초기화했습니다. 자리를 다시 골라주세요.',
      status: 'ACTIVE',
    });
  });

  it('completeGateFetch — 고른 자리가 없으면(이미 반영됨) 바뀌어도 이유를 남기지 않는다', async () => {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({ gateHtml: '<p>옛날</p>', gatePicks: { image: null, youtube: null }, status: 'ACTIVE' });
    const prisma = { cafeIntegration: { update, findUnique } } as unknown as PrismaClient;
    expect(await completeGateFetch(prisma, 1, { html: MARKED, render: null })).toEqual({ changed: true, reset: false, reactivated: false });
    expect(update.mock.calls[0][0].data.statusMessage).toBeNull();
  });

  it('requestGateRefresh — 스냅샷·재시도 시각을 비워 다음 폴링에 저장하게 하고 ACTIVE 로', async () => {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({ id: 1, clubId: 'c1', status: 'PERMISSION_OK', pendingAction: null, gateHtml: MARKED });
    const naverBotSession = { findUnique: vi.fn().mockResolvedValue({ id: 1 }) };
    const prisma = { cafeIntegration: { update, findUnique }, naverBotSession } as unknown as PrismaClient;
    await expect(requestGateRefresh(prisma, 7)).resolves.toEqual({ ok: true });
    expect(update.mock.calls[0][0]).toMatchObject({ where: { userId: 7 }, data: { saveAttemptedAt: null, status: 'ACTIVE', statusMessage: null } });
    const noBlock = { cafeIntegration: { update, findUnique: vi.fn().mockResolvedValue({ id: 1, clubId: 'c1', status: 'ACTIVE', pendingAction: null, gateHtml: '<p></p>' }) }, naverBotSession } as unknown as PrismaClient;
    await expect(requestGateRefresh(noBlock, 7)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
