import { describe, expect, it, vi } from 'vitest';

import type { Context } from '../../trpc';
import type { ChatbotDataFunction } from '..';
import { functionSong } from '../song';

/** 노래 신청 기능 off 시 채팅 응답 (#237) */

const USER_ID = 1;
const OFF_MESSAGE = '노래 신청 기능이 꺼져 있습니다.';

function createCtx({ songActive }: { songActive: boolean }) {
  const ctx = {
    prisma: {
      userSetting: {
        findFirst: vi.fn().mockResolvedValue({ userId: USER_ID, songActive }),
        findUnique: vi.fn().mockResolvedValue({ userId: USER_ID, songActive }),
      },
      song: { findMany: vi.fn().mockResolvedValue([]) },
      songPlayback: { findUnique: vi.fn().mockResolvedValue(null) },
      chatbotFunctionCommand: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { findUnique: vi.fn().mockResolvedValue({ channelId: 'abc' }) },
    },
  } as unknown as Context;
  return ctx;
}

function dataOf(content: string, command: string): ChatbotDataFunction {
  return {
    userId: USER_ID,
    senderNickname: '시청자',
    senderChannelId: 'viewer1',
    senderRole: 'VIEWER',
    content,
    query: { id: 1, userId: USER_ID, command, function: 'requestSong', permission: 'VIEWER', option: null },
    chzzk: {},
  } as unknown as ChatbotDataFunction;
}

describe('노래 신청 기능 off (#237)', () => {
  it('신청이 꺼졌다고 응답하고 등록하지 않는다', async () => {
    const ctx = createCtx({ songActive: false });
    const result = await functionSong.requestSong(ctx, dataOf('!노래 신청 LUCY 개화', '노래 신청'));
    expect(result).toEqual({ ok: true, message: OFF_MESSAGE });
  });

  it('삭제·목록·현재 곡도 꺼졌다고 응답한다', async () => {
    const ctx = createCtx({ songActive: false });
    await expect(functionSong.removeSong(ctx, dataOf('!노래 삭제', '노래 삭제'))).resolves.toEqual({
      ok: true,
      message: OFF_MESSAGE,
    });
    await expect(functionSong.listSongs(ctx, dataOf('!노래 목록', '노래 목록'))).resolves.toEqual({
      ok: true,
      message: OFF_MESSAGE,
    });
    await expect(functionSong.currentSong(ctx, dataOf('!현재 곡', '현재 곡'))).resolves.toEqual({
      ok: true,
      message: OFF_MESSAGE,
    });
  });

  it('켜져 있으면 목록 명령은 평소대로 동작한다', async () => {
    const ctx = createCtx({ songActive: true });
    const result = await functionSong.listSongs(ctx, dataOf('!노래 목록', '노래 목록'));
    expect(result.ok).toBe(true);
    expect(result.message).toContain('대기열이 비어 있습니다.');
  });
});
