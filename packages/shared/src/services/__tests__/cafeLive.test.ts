import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CafeSnapshot } from '../../lib/cafeLayout';
import { evaluateLive, reportSave } from '../cafe';

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
