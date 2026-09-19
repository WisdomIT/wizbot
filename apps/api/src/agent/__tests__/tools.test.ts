import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AGENT_TOOLS, CONFIRM_TOOLS, needsConfirmation, runTool } from '../tools';

/**
 * 에이전트 tool (#326) — 카드 분기·토큰 비노출·설정 읽기.
 * Prisma 는 손으로 만든 vi.fn() 뭉치. 서비스 계층은 실제 코드가 돌고 DB 호출만 가짜다
 */
const SETTING = {
  id: 1, userId: 1, chatbotActive: true, songActive: true, songMaxPerRequester: 1, songMaxQueueLength: 30, songMaxDurationSeconds: 600,
  songAutoPlayFromDefault: true, songHistoryPublic: false, songOverlayMode: 'TIMED', songOverlayDurationSeconds: 15,
  songSourceType: 'ELECTRON', songSourceSessionId: 'app-1', songSourceLabel: '거실-PC', songSourceToken: 'secret-source-token', songOverlayToken: 'secret-overlay-token',
};

function db() {
  const userSetting = { findFirst: vi.fn().mockResolvedValue(SETTING), findUnique: vi.fn().mockResolvedValue(SETTING), update: vi.fn().mockResolvedValue(SETTING) };
  const songPlayback = { findUnique: vi.fn().mockResolvedValue({ userId: 1, status: 'STOPPED', youtubeId: null, repeatOne: false }), create: vi.fn() };
  const songFavorite = {
    findMany: vi.fn().mockResolvedValue([{ id: 3, name: '대표', isDefault: true, _count: { items: 12 } }, { id: 4, name: '둘째', isDefault: false, _count: { items: 0 } }]),
    findFirst: vi.fn().mockImplementation(async ({ where }: { where: { id: number } }) => (where.id === 3 ? { id: 3, userId: 1, name: '대표', isDefault: true } : where.id === 4 ? { id: 4, userId: 1, name: '둘째', isDefault: false } : null)),
  };
  const songFavoriteItem = { findMany: vi.fn().mockImplementation(async ({ where }: { where: { favoriteId: number } }) => (where.favoriteId === 3 ? [{ id: 1 }, { id: 2 }] : [])) };
  const auditLog = { create: vi.fn().mockResolvedValue({}) };
  const prisma = { userSetting, songPlayback, songFavorite, songFavoriteItem, auditLog } as unknown as PrismaClient;
  return { prisma, userSetting, auditLog };
}

describe('에이전트 tool 정의', () => {
  it('새 노래 설정·즐겨찾기 도구가 등록돼 있고 이름이 겹치지 않는다', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of ['get_song_settings', 'list_song_history', 'set_overlay_settings', 'set_auto_play', 'set_history_public', 'set_default_favorite', 'delete_favorite', 'clear_favorite_items', 'requeue_from_history']) {
      expect(names).toContain(name);
    }
  });
  it('확인 카드 대상 — 파괴적·큰 변화만', () => {
    expect(CONFIRM_TOOLS.has('delete_favorite')).toBe(true);
    expect(CONFIRM_TOOLS.has('set_history_public')).toBe(true);
    expect(needsConfirmation('set_song_request_policy', { enabled: false })).toBe(true);
    expect(needsConfirmation('set_song_request_policy', { enabled: true })).toBe(false);
    expect(needsConfirmation('set_song_request_policy', { maxQueueLength: 50 })).toBe(false);
    expect(needsConfirmation('set_auto_play', { enabled: false })).toBe(false);
  });
});

describe('runTool (#326)', () => {
  it('get_user_setting 은 송출 토큰을 빼고 돌려준다', async () => {
    const { prisma } = db();
    const result = await runTool(prisma, 1, 10, 'get_user_setting', {});
    expect('content' in result).toBe(true);
    if (!('content' in result)) return;
    expect(result.isError).toBe(false);
    expect(result.content).not.toContain('secret-source-token');
    expect(result.content).not.toContain('secret-overlay-token');
    expect(result.content).toContain('chatbotActive');
  });

  it('get_song_settings — 설정 요약, 대표 즐겨찾기, 토큰 없음', async () => {
    const { prisma } = db();
    const result = await runTool(prisma, 1, 10, 'get_song_settings', {});
    if (!('content' in result)) throw new Error('card?');
    const parsed = JSON.parse(result.content);
    expect(parsed).toMatchObject({
      songRequestEnabled: true, maxPerRequester: 1, maxQueueLength: 30, maxDurationMinutes: 10,
      overlay: { mode: 'TIMED', durationSeconds: 15 }, autoPlay: true, historyPublic: false,
      defaultFavorite: { id: 3, name: '대표', songs: 12 }, repeatOne: false,
      source: { type: 'ELECTRON', label: '거실-PC', connected: false },
    });
    expect(result.content).not.toContain('secret-');
  });

  it('delete_favorite 는 실행하지 않고 카드를 돌려준다 (이름·곡 수·대표 안내)', async () => {
    const { prisma } = db();
    const result = await runTool(prisma, 1, 10, 'delete_favorite', { favoriteId: 3 });
    expect(result).toMatchObject({ card: { title: '즐겨찾기 삭제' } });
    if (!('card' in result)) return;
    expect(result.card.lines[0]).toContain('"대표" 즐겨찾기(2곡)');
    expect(result.card.lines[0]).toContain('대표 즐겨찾기라');
  });

  it('clear_favorite_items — 빈 즐겨찾기는 카드 대신 오류', async () => {
    const { prisma } = db();
    await expect(runTool(prisma, 1, 10, 'clear_favorite_items', { favoriteId: 4 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('노래 신청 끄기는 카드, 켜기·제한 변경은 바로 실행 + 감사 기록 (최대 길이 분→초)', async () => {
    const { prisma, userSetting, auditLog } = db();
    expect(await runTool(prisma, 1, 10, 'set_song_request_policy', { enabled: false })).toMatchObject({ card: { title: '노래 신청 기능 끄기' } });
    expect(userSetting.update).not.toHaveBeenCalled();

    const result = await runTool(prisma, 1, 10, 'set_song_request_policy', { maxDurationMinutes: 15, maxQueueLength: 50 });
    expect(result).toMatchObject({ isError: false });
    expect(userSetting.update).toHaveBeenCalledWith(expect.objectContaining({ data: { songActive: true, songMaxPerRequester: 1, songMaxQueueLength: 50, songMaxDurationSeconds: 900 } }));
    expect(auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ procedure: 'agent.set_song_request_policy', actorType: 'AGENT' }) }));
  });

  it('set_overlay_settings — mode 검증, 초 생략 시 현재 값 유지', async () => {
    const { prisma, userSetting } = db();
    const bad = await runTool(prisma, 1, 10, 'set_overlay_settings', { mode: 'SOMETIMES' }).catch((e: unknown) => e);
    expect(bad).toMatchObject({ code: 'INVALID_INPUT' });
    const result = await runTool(prisma, 1, 10, 'set_overlay_settings', { mode: 'ALWAYS' });
    expect(result).toMatchObject({ isError: false, content: expect.stringContaining('"durationSeconds": 15') });
    expect(userSetting.update).toHaveBeenCalledWith(expect.objectContaining({ data: { songOverlayMode: 'ALWAYS', songOverlayDurationSeconds: 15 } }));
  });
});
