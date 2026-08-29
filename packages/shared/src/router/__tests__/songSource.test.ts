import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearSource } from '../../services/songEvents';
import type { Context } from '../../trpc';
import { appRouter } from '..';

const USER_ID = 1;

/** 송출 소스(토큰)로 들어온 요청을 흉내낸다 */
function createCaller(sourceType: 'NONE' | 'OBS' | 'ELECTRON') {
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
        userId: USER_ID,
        songSourceType: sourceType,
        songOverlayMode: 'ALWAYS',
        songOverlayDurationSeconds: 10,
      }),
    },
  };
  const ctx = {
    prisma,
    user: null,
    internal: false,
    songSource: { userId: USER_ID, readOnly: false },
  } as unknown as Context;

  return appRouter.createCaller(ctx);
}

describe('song.heartbeat', () => {
  beforeEach(() => clearSource(USER_ID));

  it('지정된 소스면 활성 세션이 된다', async () => {
    const caller = createCaller('OBS');
    await expect(caller.song.heartbeat({ sessionId: 's1', source: 'OBS' })).resolves.toMatchObject({
      active: true,
    });
  });

  it('지정되지 않은 소스의 하트비트는 무시한다', async () => {
    // OBS 페이지와 앱을 함께 열어두면 두 창이 프레즌스를 번갈아 덮어써
    // 연결 상태가 깜빡였다 (#85)
    const caller = createCaller('ELECTRON');

    await expect(caller.song.heartbeat({ sessionId: 'obs', source: 'OBS' })).resolves.toMatchObject(
      { active: false },
    );
    // 앱이 뒤이어 보내면 그대로 활성이 된다 — OBS 가 자리를 뺏지 않았다
    await expect(
      caller.song.heartbeat({ sessionId: 'app', source: 'ELECTRON' }),
    ).resolves.toMatchObject({ active: true });
    await expect(caller.song.heartbeat({ sessionId: 'obs', source: 'OBS' })).resolves.toMatchObject(
      { active: false },
    );
    await expect(
      caller.song.heartbeat({ sessionId: 'app', source: 'ELECTRON' }),
    ).resolves.toMatchObject({ active: true });
  });
});
