import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearSource } from '../../services/songEvents';
import type { Context } from '../../trpc';
import { appRouter } from '..';

const USER_ID = 1;

/** 송출 소스(토큰)로 들어온 요청을 흉내낸다 */
function createCaller(setting: { songSourceSessionId: string | null; songSourceType: 'NONE' | 'OBS' | 'ELECTRON' }) {
  const userSettingUpdate = vi.fn().mockResolvedValue({});
  const prisma = {
    songPlayback: {
      findUnique: vi.fn().mockResolvedValue({
        userId: USER_ID,
        status: 'STOPPED',
        youtubeId: null,
        durationSeconds: 0,
        positionSeconds: 0,
        volume: 70,
        repeatOne: false,
      }),
      create: vi.fn(),
    },
    userSetting: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        userId: USER_ID,
        ...setting,
        songOverlayMode: 'ALWAYS',
        songOverlayDurationSeconds: 10,
      }),
      update: userSettingUpdate,
    },
  };
  const ctx = {
    prisma,
    user: null,
    internal: false,
    songSource: { userId: USER_ID, readOnly: false },
  } as unknown as Context;

  return { caller: appRouter.createCaller(ctx), userSettingUpdate };
}

describe('song.heartbeat (#322)', () => {
  beforeEach(() => clearSource(USER_ID));

  it('고른 세션이면 활성, 응답에 activeSessionId 가 실린다', async () => {
    const { caller } = createCaller({ songSourceSessionId: 's1', songSourceType: 'OBS' });
    await expect(caller.song.heartbeat({ sessionId: 's1', source: 'OBS' })).resolves.toMatchObject({
      active: true,
      adopted: false,
      state: { activeSessionId: 's1' },
    });
  });

  it('고르지 않은 세션은 종류가 같아도 대기 — 순서가 아니라 선택이 정한다', async () => {
    const { caller } = createCaller({ songSourceSessionId: 'app-home', songSourceType: 'ELECTRON' });
    await expect(caller.song.heartbeat({ sessionId: 'app-office', source: 'ELECTRON', label: '사무실' })).resolves.toMatchObject({ active: false });
    await expect(caller.song.heartbeat({ sessionId: 'app-home', source: 'ELECTRON', label: '집' })).resolves.toMatchObject({ active: true });
    await expect(caller.song.heartbeat({ sessionId: 'app-office', source: 'ELECTRON', label: '사무실' })).resolves.toMatchObject({ active: false });
  });

  it('아직 고른 게 없으면 첫 세션을 자동 선택하고 저장한다', async () => {
    const { caller, userSettingUpdate } = createCaller({ songSourceSessionId: null, songSourceType: 'NONE' });
    await expect(caller.song.heartbeat({ sessionId: 'obs-1', source: 'OBS' })).resolves.toMatchObject({ active: true, adopted: true });
    expect(userSettingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { songSourceSessionId: 'obs-1', songSourceType: 'OBS', songSourceLabel: 'OBS 브라우저 소스' } }),
    );
  });
});
