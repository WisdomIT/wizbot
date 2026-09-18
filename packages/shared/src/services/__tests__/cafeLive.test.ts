import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CafeSnapshot } from '../../lib/cafeLayout';
import { autoRefetchDelayMs, completeGateFetch, completeGateSave, evaluateLive, listActive, listPendingActions, reportSave, requestGateRefresh } from '../cafe';

const live: CafeSnapshot = { live: true, title: '제목', category: '롤', viewers: 120, openedAt: '2026-08-29T20:00:00+09:00', thumbnailUrl: null };
const now = new Date('2026-08-29T11:10:00Z');

/** 이벤트 테이블 mock (#318) — create 만 기록하고 보존 정리는 비어 있다 */
function eventTable() {
  return { create: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) };
}

function db(row: Record<string, unknown>) {
  const update = vi.fn().mockResolvedValue({});
  const findUnique = vi.fn().mockResolvedValue({
    lastSnapshot: null, lastSavedAt: null, lastViewerBucket: null, lastSaveSerial: 3, gateSerial: 3, saveAttemptedAt: null, missingStreak: 0,
    autoRefetchCount: 0, nextRefetchAt: null, cafeName: '카페', status: 'ACTIVE',
    user: { channelId: 'chan', channelName: '마뫄' },
    ...row,
  });
  const events = eventTable();
  return { prisma: { cafeIntegration: { update, findUnique }, cafeIntegrationEvent: events } as unknown as PrismaClient, update, events };
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
  it('성공: gateSerial·gateHtml 갱신, 연속 사라짐 0', async () => {
    const { prisma, update } = db({});
    await reportSave(prisma, 1, { ok: true, serial: 4, html: '<p>x</p>' }, now);
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { gateSerial: 4, gateHtml: '<p>x</p>', gateUpdatedAt: now, statusMessage: null, missingStreak: 0 } });
  });
  it('missing 1·2회째: 진행 상황만 남기고 상태·자리·gateHtml 은 그대로 (#318)', async () => {
    const { prisma, update, events } = db({ missingStreak: 1 });
    expect(await reportSave(prisma, 1, { ok: false, message: '사라짐', missing: true, html: '<p></p>' }, now)).toEqual({ stopped: false });
    expect(update).toHaveBeenLastCalledWith({ where: { id: 1 }, data: { missingStreak: 2, statusMessage: '대문에서 방송 상태 이미지를 찾지 못했습니다 (2/3) — 재확인 중' } });
    expect(events.create.mock.calls[0][0].data).toMatchObject({ integrationId: 1, kind: 'MISSING', htmlLength: 7 });
  });
  it('missing 3회 연속: 동작 중지 + 자리 초기화 + 5분 뒤 자동 재불러오기 예약', async () => {
    const { prisma, update, events } = db({ missingStreak: 2 });
    expect(await reportSave(prisma, 1, { ok: false, message: '사라짐.', missing: true, html: '<p></p>' }, now)).toEqual({ stopped: true });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        status: 'PERMISSION_OK', gatePicks: { image: null, youtube: null }, gateHtml: '<p></p>', missingStreak: 3, autoRefetchCount: 0,
        nextRefetchAt: new Date(now.getTime() + 5 * 60_000),
      }),
    });
    expect(update.mock.calls[0][0].data.statusMessage).toMatch(/^사라짐\. 자동으로 대문을 다시 확인합니다/);
    expect(events.create.mock.calls[0][0].data.kind).toBe('STOPPED');
  });
  it('suspicious(잘린 읽기 의심): 이벤트만 남기고 DB 상태는 건드리지 않는다', async () => {
    const { prisma, update, events } = db({});
    await reportSave(prisma, 1, { ok: false, message: '읽기 불안정', suspicious: true, htmlLength: 120 }, now);
    expect(update).not.toHaveBeenCalled();
    expect(events.create.mock.calls[0][0].data).toMatchObject({ kind: 'SUSPICIOUS_READ', htmlLength: 120 });
  });
  it('그 밖의 저장 실패: 상태 메시지 + SAVE_FAILED 이벤트', async () => {
    const { prisma, update, events } = db({});
    await reportSave(prisma, 1, { ok: false, message: '타임아웃' }, now);
    expect(update).toHaveBeenCalledWith({ where: { id: 1 }, data: { statusMessage: '타임아웃' } });
    expect(events.create.mock.calls[0][0].data.kind).toBe('SAVE_FAILED');
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
    //  gateHtml 은 워커의 읽기 건전성 검사에 쓴다 (#318)
    expect(rows[0].gateHtml).toBe(MARKED);
    expect(findMany.mock.calls[0][0].where.status).toEqual({ in: ['ACTIVE', 'PERMISSION_OK'] });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: [1] } }, data: { status: 'ACTIVE', statusMessage: null } });
  });

  it('completeGateFetch — 바뀌었으면 고른 자리를 버리되 이유를 남기고, 블록이 있으면 중지 상태를 되돌린다 (+스냅샷 비움 #318)', async () => {
    const { prisma, update, events } = db({ gateHtml: '<p>옛날</p>', gatePicks: { image: { path: [0], w: 1, h: 1 }, youtube: null }, status: 'PERMISSION_OK' });
    const result = await completeGateFetch(prisma, 1, { html: MARKED, render: null });
    expect(result).toEqual({ changed: true, reset: true, reactivated: true, auto: false, gaveUp: null });
    expect(update.mock.calls[0][0].data).toMatchObject({
      gatePicks: { image: null, youtube: null },
      statusMessage: '대문이 바뀌어 고른 자리를 초기화했습니다. 자리를 다시 골라주세요.',
      status: 'ACTIVE',
      //  「지금 반영」 없이 다음 폴링에 바로 저장하게 (#318)
      saveAttemptedAt: null, missingStreak: 0, autoRefetchCount: 0, nextRefetchAt: null,
    });
    expect(events.create.mock.calls[0][0].data.kind).toBe('RECOVERED');
  });

  it('completeGateFetch — 고른 자리가 없으면(이미 반영됨) 바뀌어도 이유를 남기지 않는다', async () => {
    const { prisma, update } = db({ gateHtml: '<p>옛날</p>', gatePicks: { image: null, youtube: null }, status: 'ACTIVE' });
    expect(await completeGateFetch(prisma, 1, { html: MARKED, render: null })).toMatchObject({ changed: true, reset: false, reactivated: false });
    expect(update.mock.calls[0][0].data.statusMessage).toBeNull();
  });

  it('requestGateRefresh — 스냅샷·재시도 시각을 비워 다음 폴링에 저장하게 하고 ACTIVE 로', async () => {
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({ id: 1, clubId: 'c1', status: 'PERMISSION_OK', pendingAction: null, gateHtml: MARKED });
    const naverBotSession = { findUnique: vi.fn().mockResolvedValue({ id: 1 }) };
    const prisma = { cafeIntegration: { update, findUnique }, naverBotSession } as unknown as PrismaClient;
    await expect(requestGateRefresh(prisma, 7)).resolves.toEqual({ ok: true });
    expect(update.mock.calls[0][0]).toMatchObject({ where: { userId: 7 }, data: { saveAttemptedAt: null, status: 'ACTIVE', statusMessage: null, autoRefetchCount: 0, nextRefetchAt: null } });
    const noBlock = { cafeIntegration: { update, findUnique: vi.fn().mockResolvedValue({ id: 1, clubId: 'c1', status: 'ACTIVE', pendingAction: null, gateHtml: '<p></p>' }) }, naverBotSession } as unknown as PrismaClient;
    await expect(requestGateRefresh(noBlock, 7)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('자동 재불러오기 (#318)', () => {
  it('간격: 5·10·20·40·60·60분', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => autoRefetchDelayMs(n) / 60_000)).toEqual([5, 10, 20, 40, 60, 60]);
  });

  it('listPendingActions — 예약 시각이 지난 PERMISSION_OK 연동을 FETCH_GATE 로 올리고 횟수·다음 시각을 잡는다', async () => {
    const due = { id: 2, autoRefetchCount: 1 };
    const findMany = vi.fn()
      .mockResolvedValueOnce([due])
      .mockResolvedValueOnce([]);
    const update = vi.fn().mockResolvedValue({});
    const events = eventTable();
    const prisma = { cafeIntegration: { findMany, update }, cafeIntegrationEvent: events } as unknown as PrismaClient;
    await listPendingActions(prisma, now);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: 'PERMISSION_OK', pendingAction: null, nextRefetchAt: { lte: now } });
    expect(update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { pendingAction: 'FETCH_GATE', requestedAt: now, autoRefetchCount: 2, nextRefetchAt: new Date(now.getTime() + 10 * 60_000) },
    });
    expect(events.create.mock.calls[0][0].data).toMatchObject({ integrationId: 2, kind: 'AUTO_REFETCH', message: '자동 재불러오기 2/10' });
  });

  it('listPendingActions — 10회째는 다음 시각을 잡지 않는다', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([{ id: 2, autoRefetchCount: 9 }]).mockResolvedValueOnce([]);
    const update = vi.fn().mockResolvedValue({});
    const prisma = { cafeIntegration: { findMany, update }, cafeIntegrationEvent: eventTable() } as unknown as PrismaClient;
    await listPendingActions(prisma, now);
    expect(update.mock.calls[0][0].data).toMatchObject({ autoRefetchCount: 10, nextRefetchAt: null });
  });

  it('completeGateFetch — 자동 재불러오기가 표식을 찾으면 재개(카운터 초기화·스냅샷 비움), 자동 표시', async () => {
    const { prisma, update } = db({ gateHtml: '<p>잘림</p>', gatePicks: { image: null, youtube: null }, status: 'PERMISSION_OK', autoRefetchCount: 3, nextRefetchAt: now });
    const result = await completeGateFetch(prisma, 1, { html: MARKED, render: null });
    expect(result).toMatchObject({ reactivated: true, auto: true, gaveUp: null });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', autoRefetchCount: 0, nextRefetchAt: null, saveAttemptedAt: null });
  });

  it('completeGateFetch — 표식 없이 예약이 남아 있으면 진행 상황 메시지, 10회 다 쓰면 포기(GAVE_UP + 운영자 알림 정보)', async () => {
    const going = db({ gateHtml: '<p>x</p>', gatePicks: { image: null, youtube: null }, status: 'PERMISSION_OK', autoRefetchCount: 4, nextRefetchAt: now });
    const r1 = await completeGateFetch(going.prisma, 1, { html: '<p>x</p>', render: null });
    expect(r1).toMatchObject({ reactivated: false, auto: true, gaveUp: null });
    expect(going.update.mock.calls[0][0].data.statusMessage).toContain('자동 복구 시도 중 (4/10)');
    expect(going.update.mock.calls[0][0].data.status).toBeUndefined();

    const last = db({ gateHtml: '<p>x</p>', gatePicks: { image: null, youtube: null }, status: 'PERMISSION_OK', autoRefetchCount: 10, nextRefetchAt: null });
    const r2 = await completeGateFetch(last.prisma, 1, { html: '<p>x</p>', render: null });
    expect(r2.gaveUp).toEqual({ id: 1, channelName: '마뫄', cafeName: '카페', attempts: 10 });
    expect(last.update.mock.calls[0][0].data.statusMessage).toMatch(/^자동 복구 10회 실패/);
    expect(last.events.create.mock.calls[0][0].data.kind).toBe('GAVE_UP');
  });

  it('completeGateSave 실패 — 자동 재불러오기가 읽기 오류로 끝나도 10회째면 포기, 아니면 그대로 이어간다', async () => {
    const going = db({ status: 'PERMISSION_OK', autoRefetchCount: 2, nextRefetchAt: now });
    expect(await completeGateSave(going.prisma, 1, { ok: false, message: '타임아웃' })).toEqual({ gaveUp: null });
    expect(going.update.mock.calls[0][0].data).toEqual({ pendingAction: null, statusMessage: '타임아웃' });
    expect(going.events.create.mock.calls[0][0].data.kind).toBe('SAVE_FAILED');

    const last = db({ status: 'PERMISSION_OK', autoRefetchCount: 10, nextRefetchAt: null });
    const r = await completeGateSave(last.prisma, 1, { ok: false, message: '타임아웃' });
    expect(r.gaveUp).toMatchObject({ attempts: 10 });
  });

  it('completeGateSave — 의심 읽기 실패는 SUSPICIOUS_READ 이벤트(길이 포함), stale 은 자리 초기화 + STALE', async () => {
    const a = db({});
    await completeGateSave(a.prisma, 1, { ok: false, message: '불안정', suspicious: true, htmlLength: 77 });
    expect(a.events.create.mock.calls[0][0].data).toMatchObject({ kind: 'SUSPICIOUS_READ', htmlLength: 77 });
    expect(a.update.mock.calls[0][0].data.gatePicks).toBeUndefined();
    const b = db({});
    await completeGateSave(b.prisma, 1, { ok: false, message: '바뀜', stale: true });
    expect(b.update.mock.calls[0][0].data.gatePicks).toEqual({ image: null, youtube: null });
    expect(b.events.create.mock.calls[0][0].data.kind).toBe('STALE');
  });

  it('completeGateSave 성공 — 사용자 반영이 끝났으니 자동 판정 상태를 초기화한다', async () => {
    const { prisma, update } = db({});
    await completeGateSave(prisma, 1, { ok: true, html: MARKED, picks: { image: null, youtube: null }, render: null });
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', missingStreak: 0, autoRefetchCount: 0, nextRefetchAt: null });
  });
});
