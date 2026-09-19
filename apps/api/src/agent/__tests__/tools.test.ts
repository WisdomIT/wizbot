import type { PrismaClient } from '@prisma/client';
import { clearSource, touchSource } from '@wizbot/shared/services';
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

describe('송출 소스 도구 (#326 2단계)', () => {
  it('get_source_status — 세션 목록과 선택, 토큰 없음', async () => {
    clearSource(1);
    touchSource(1, { sessionId: 'app-1', source: 'ELECTRON', label: '거실-PC' });
    touchSource(1, { sessionId: 'obs-1', source: 'OBS', label: 'OBS 브라우저 소스' });
    const { prisma } = db();
    const result = await runTool(prisma, 1, 10, 'get_source_status', {});
    if (!('content' in result)) throw new Error('card?');
    const parsed = JSON.parse(result.content);
    expect(parsed.selected).toMatchObject({ sessionId: 'app-1', kind: 'ELECTRON', label: '거실-PC', connected: true });
    expect(parsed.sessions.map((x: { sessionId: string; active: boolean }) => [x.sessionId, x.active])).toEqual([['app-1', true], ['obs-1', false]]);
    expect(result.content).not.toContain('secret-');
  });

  it('select_source 는 카드 — 대상·지금 소리 나는 창을 적는다. 이미 선택된 세션·없는 세션은 오류', async () => {
    clearSource(1);
    touchSource(1, { sessionId: 'app-1', source: 'ELECTRON', label: '거실-PC' });
    touchSource(1, { sessionId: 'obs-1', source: 'OBS', label: 'OBS 브라우저 소스' });
    const { prisma, userSetting } = db();
    const result = await runTool(prisma, 1, 10, 'select_source', { sessionId: 'obs-1' });
    expect(result).toMatchObject({ card: { title: '송출 소스 변경' } });
    if (!('card' in result)) return;
    expect(result.card.lines[0]).toContain('OBS 브라우저 소스 · OBS 브라우저 소스 에서 소리가');
    expect(result.card.lines[1]).toContain('플레이어 앱 · 거실-PC');
    expect(userSetting.update).not.toHaveBeenCalled();
    await expect(runTool(prisma, 1, 10, 'select_source', { sessionId: 'app-1' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(runTool(prisma, 1, 10, 'select_source', { sessionId: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('clear_source_selection 은 카드, locate_source 는 바로 실행(연결된 세션만)', async () => {
    clearSource(1);
    touchSource(1, { sessionId: 'app-1', source: 'ELECTRON', label: '거실-PC' });
    const { prisma } = db();
    expect(await runTool(prisma, 1, 10, 'clear_source_selection', {})).toMatchObject({ card: { title: '송출 소스 선택 해제' } });
    expect(await runTool(prisma, 1, 10, 'locate_source', { sessionId: 'app-1' })).toMatchObject({ isError: false });
    const missing = await runTool(prisma, 1, 10, 'locate_source', { sessionId: 'nope' }).catch((e: unknown) => e);
    expect(missing).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('get_obs_source_url 은 주소를 돌려주지 않는다 — 카드 안내만', async () => {
    const { prisma } = db();
    const result = await runTool(prisma, 1, 10, 'get_obs_source_url', {});
    if (!('content' in result)) throw new Error('card?');
    expect(result.isError).toBe(false);
    expect(result.content).not.toContain('secret-');
    expect(result.content).not.toContain('/obs/');
    expect(result.content).toContain('카드');
  });
});

describe('계정·카페·문의 도구 (#326 3단계)', () => {
  it('끄기만 카드: 챗봇·카페 연동. 시청자 목록 노출·문의 추가 메시지는 항상 카드', () => {
    expect(needsConfirmation('set_chatbot_active', { active: false })).toBe(true);
    expect(needsConfirmation('set_chatbot_active', { active: true })).toBe(false);
    expect(needsConfirmation('set_cafe_enabled', { enabled: false })).toBe(true);
    expect(needsConfirmation('set_cafe_enabled', { enabled: true })).toBe(false);
    expect(CONFIRM_TOOLS.has('set_listed')).toBe(true);
    expect(CONFIRM_TOOLS.has('reply_inquiry')).toBe(true);
    expect(needsConfirmation('set_chatbot_default_repeat', { seconds: 300 })).toBe(false);
  });

  it('get_account_settings — 계정 요약 + 테마는 위치 안내', async () => {
    const { prisma } = db();
    (prisma as unknown as { user: unknown }).user = { findUnique: vi.fn().mockResolvedValue({ channelId: 'c', channelName: '위즈', channelImageUrl: null, hidden: false, userSetting: { chatbotActive: true } }) };
    const result = await runTool(prisma, 1, 10, 'get_account_settings', {});
    if (!('content' in result)) throw new Error('card?');
    const parsed = JSON.parse(result.content);
    expect(parsed).toMatchObject({ channelName: '위즈', listed: true, chatbotActive: true });
    expect(String(parsed.theme)).toContain('설정 › 테마');
  });

  it('set_chatbot_default_repeat — 범위 검증 후 저장 + 감사 기록', async () => {
    const { prisma, userSetting, auditLog } = db();
    await expect(runTool(prisma, 1, 10, 'set_chatbot_default_repeat', { seconds: 3 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await runTool(prisma, 1, 10, 'set_chatbot_default_repeat', { seconds: 600 })).toMatchObject({ isError: false });
    expect(userSetting.update).toHaveBeenCalledWith(expect.objectContaining({ data: { chatbotDefaultRepeat: 600 } }));
    expect(auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ procedure: 'agent.set_chatbot_default_repeat' }) }));
  });

  it('get_cafe_integration — 연결 전이면 메뉴 안내만', async () => {
    const { prisma } = db();
    (prisma as unknown as { cafeIntegration: unknown }).cafeIntegration = { findUnique: vi.fn().mockResolvedValue(null) };
    const result = await runTool(prisma, 1, 10, 'get_cafe_integration', {});
    if (!('content' in result)) throw new Error('card?');
    expect(JSON.parse(result.content)).toMatchObject({ linked: false, enabled: false });
    expect(result.content).toContain('/manual/cafe');
  });
});
