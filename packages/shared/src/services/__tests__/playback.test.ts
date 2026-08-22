import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceToNext,
  setShortcuts,
  togglePlay,
  playSongNow,
  seek,
  getSourceStatus,
  isSessionActive,
  reportEnded,
  skipToNext,
  touchSourceSession,
} from '../playback';
import { SOURCE_TIMEOUT_MS, clearSource, subscribeSongEvents } from '../songEvents';

const USER_ID = 1;

function createPrisma(queue: unknown[] = [], playback: unknown = null) {
  const songPlayback = {
    findUnique: vi.fn().mockResolvedValue(playback),
    create: vi.fn().mockResolvedValue({ userId: USER_ID, status: 'STOPPED' }),
    update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({
      userId: USER_ID,
      ...data,
    })),
  };
  const prisma = {
    songPlayback,
    song: {
      findFirst: vi.fn().mockResolvedValue(queue[0] ?? null),
      delete: vi.fn().mockResolvedValue({}),
    },
    songFavorite: { findFirst: vi.fn().mockResolvedValue(null) },
    songFavoriteItem: { findMany: vi.fn().mockResolvedValue([]) },
    songHistory: { create: vi.fn().mockResolvedValue({}) },
    userSetting: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        userId: USER_ID,
        songSourceType: 'OBS',
        songSourceToken: 'tok',
        songOverlayToken: 'otok',
      }),
      update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ ...data })),
    },
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => ops),
  } as unknown as PrismaClient;
  return { prisma, songPlayback };
}

const QUEUE_ITEM = {
  id: 7,
  userId: USER_ID,
  youtubeId: 'aaaaaaaaaaa',
  title: '다음 곡',
  videoUploader: 'ch',
  requester: '위즈',
  durationSeconds: 200,
  order: 1,
};

describe('togglePlay (#85)', () => {
  it('재생 중이면 일시정지한다', async () => {
    const { prisma, songPlayback } = createPrisma([], {
      userId: USER_ID,
      status: 'PLAYING',
      youtubeId: 'aaaaaaaaaaa',
      title: '곡',
    });

    await togglePlay(prisma, USER_ID);

    expect(songPlayback.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PAUSED' } }),
    );
  });

  it('멈춰 있으면 재생한다', async () => {
    const { prisma, songPlayback } = createPrisma([], {
      userId: USER_ID,
      status: 'PAUSED',
      youtubeId: 'aaaaaaaaaaa',
      title: '곡',
    });

    await togglePlay(prisma, USER_ID);

    expect(songPlayback.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PLAYING' } }),
    );
  });
});

describe('전역 단축키 (#85)', () => {
  it('수식키 없는 조합은 거부한다', async () => {
    const { prisma } = createPrisma();
    await expect(
      setShortcuts(prisma, USER_ID, { playPause: 'P', stop: 'S', next: 'N' }),
    ).rejects.toThrow('형식이 올바르지 않습니다');
  });

  it('서로 겹치는 조합은 거부한다', async () => {
    const { prisma } = createPrisma();
    await expect(
      setShortcuts(prisma, USER_ID, {
        playPause: 'CommandOrControl+Shift+P',
        stop: 'CommandOrControl+Shift+P',
        next: 'CommandOrControl+Shift+N',
      }),
    ).rejects.toThrow('겹칩니다');
  });

  it('올바른 조합은 저장한다', async () => {
    const { prisma } = createPrisma();
    await expect(
      setShortcuts(prisma, USER_ID, {
        playPause: 'Alt+Shift+1',
        stop: 'CommandOrControl+Alt+S',
        next: 'Shift+Alt+N',
      }),
    ).resolves.toEqual({ ok: true });
    expect(prisma.userSetting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ songShortcutPlayPause: 'Alt+Shift+1' }),
      }),
    );
  });
});

describe('한 곡 반복 (#97)', () => {
  it('곡이 끝나도 다음으로 넘기지 않고 처음부터 다시 재생한다', async () => {
    const { prisma, songPlayback } = createPrisma([QUEUE_ITEM], {
      userId: USER_ID,
      status: 'PLAYING',
      youtubeId: 'zzzzzzzzzzz',
      title: '반복 중인 곡',
      repeatOne: true,
    });

    const result = await reportEnded(prisma, USER_ID);

    expect(result).toMatchObject({ status: 'PLAYING', positionSeconds: 0 });
    // 반복은 이력을 남기지 않는다 — 같은 곡으로 기록이 뒤덮이지 않게
    expect(prisma.songHistory.create).not.toHaveBeenCalled();
    // 대기열의 다음 곡을 끌어오지 않는다
    expect(songPlayback.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ youtubeId: expect.anything() }) }),
    );
  });

  it('반복이 꺼져 있으면 평소대로 이력을 남기고 다음 곡으로 간다', async () => {
    const { prisma } = createPrisma([QUEUE_ITEM], {
      userId: USER_ID,
      status: 'PLAYING',
      youtubeId: 'zzzzzzzzzzz',
      title: '재생하던 곡',
      repeatOne: false,
    });

    const result = await reportEnded(prisma, USER_ID);

    expect(prisma.songHistory.create).toHaveBeenCalled();
    expect(result).toMatchObject({ youtubeId: QUEUE_ITEM.youtubeId });
  });
});

describe('자동 재생 (#5 3단계)', () => {
  beforeEach(() => clearSource(USER_ID));

  it('대기열이 비면 대표 즐겨찾기에서 한 곡을 이어 재생한다', async () => {
    const { prisma, songPlayback } = createPrisma([]);
    // 설정 on + 대표 즐겨찾기에 곡 하나
    vi.mocked(prisma.userSetting.findUnique).mockResolvedValue({
      userId: USER_ID,
      songAutoPlayFromDefault: true,
    } as never);
    vi.mocked(prisma.songFavorite.findFirst).mockResolvedValue({
      id: 3,
      userId: USER_ID,
      isDefault: true,
    } as never);
    vi.mocked(prisma.songFavoriteItem.findMany).mockResolvedValue([
      { id: 1, favoriteId: 3, youtubeId: 'zzzzzzzzzzz', title: '즐겨찾기 곡', videoUploader: 'ch', durationSeconds: 100, order: 1 },
    ] as never);

    const result = await advanceToNext(prisma, USER_ID);

    expect(result).toMatchObject({ status: 'PLAYING', youtubeId: 'zzzzzzzzzzz', requester: '자동 재생' });
    expect(songPlayback.update).toHaveBeenCalled();
  });

  it('설정이 꺼져 있으면 평소대로 정지한다', async () => {
    const { prisma } = createPrisma([]);
    vi.mocked(prisma.userSetting.findUnique).mockResolvedValue({
      userId: USER_ID,
      songAutoPlayFromDefault: false,
    } as never);

    const result = await advanceToNext(prisma, USER_ID);

    expect(result).toMatchObject({ status: 'STOPPED', youtubeId: null });
    expect(prisma.songFavorite.findFirst).not.toHaveBeenCalled();
  });
});

describe('advanceToNext', () => {
  beforeEach(() => vi.clearAllMocks());

  it('큐가 비면 정지 상태로 만든다', async () => {
    const { prisma, songPlayback } = createPrisma([]);
    await advanceToNext(prisma, USER_ID);
    expect(songPlayback.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'STOPPED', youtubeId: null }),
      }),
    );
  });

  it('큐 첫 곡을 현재 곡으로 올리고 큐에서 제거한다 (트랜잭션)', async () => {
    const { prisma } = createPrisma([QUEUE_ITEM]);
    await advanceToNext(prisma, USER_ID);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.song.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});

describe('이력 기록', () => {
  beforeEach(() => vi.clearAllMocks());

  const CURRENT = {
    userId: USER_ID,
    status: 'PLAYING',
    youtubeId: 'bbbbbbbbbbb',
    title: '현재 곡',
    videoUploader: 'ch',
    requester: '위즈',
    durationSeconds: 100,
    startedAt: new Date(),
  };

  it('끝까지 재생하면 PLAYED 로 남기고 다음 곡으로', async () => {
    const { prisma } = createPrisma([QUEUE_ITEM], CURRENT);
    await reportEnded(prisma, USER_ID);
    expect(prisma.songHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PLAYED' }) }),
    );
  });

  it('다음 곡 버튼은 SKIPPED 로 남긴다', async () => {
    const { prisma } = createPrisma([QUEUE_ITEM], CURRENT);
    await skipToNext(prisma, USER_ID, '위즈');
    expect(prisma.songHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SKIPPED', resolvedBy: '위즈' }),
      }),
    );
  });

  it('재생 중인 곡이 없으면 이력을 남기지 않는다', async () => {
    const { prisma } = createPrisma([], { userId: USER_ID, status: 'STOPPED', youtubeId: null });
    await skipToNext(prisma, USER_ID);
    expect(prisma.songHistory.create).not.toHaveBeenCalled();
  });
});

describe('바로 재생·시크 (#5 2-b)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('지정한 곡을 현재 곡으로 올리고 이전 곡은 SKIPPED 로 남긴다', async () => {
    const { prisma } = createPrisma([QUEUE_ITEM], {
      userId: USER_ID,
      status: 'PLAYING',
      youtubeId: 'bbbbbbbbbbb',
      title: '이전 곡',
      videoUploader: 'ch',
      requester: '위즈',
      durationSeconds: 100,
      startedAt: new Date(),
    });
    prisma.song.findFirst = vi.fn().mockResolvedValue(QUEUE_ITEM);

    await playSongNow(prisma, USER_ID, QUEUE_ITEM.id, '스트리머');

    expect(prisma.songHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SKIPPED' }) }),
    );
    expect(prisma.song.delete).toHaveBeenCalledWith({ where: { id: QUEUE_ITEM.id } });
  });

  it('대기열에 없는 곡은 NOT_FOUND', async () => {
    const { prisma } = createPrisma([]);
    prisma.song.findFirst = vi.fn().mockResolvedValue(null);
    await expect(playSongNow(prisma, USER_ID, 999)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('시크는 위치를 정수로 맞춰 저장한다', async () => {
    const { prisma, songPlayback } = createPrisma();
    await seek(prisma, USER_ID, 42.7);
    expect(songPlayback.update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { positionSeconds: 42 },
    });
  });
});

describe('송출 소스 중재', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSource(USER_ID);
  });

  it('하트비트가 없으면 오프라인', async () => {
    const { prisma } = createPrisma();
    const status = await getSourceStatus(prisma, USER_ID);
    expect(status.online).toBe(false);
  });

  it('하트비트를 보내면 온라인이 된다', async () => {
    const { prisma } = createPrisma();
    touchSourceSession(USER_ID, 'OBS', 'session-1');
    const status = await getSourceStatus(prisma, USER_ID);
    expect(status.online).toBe(true);
  });

  it('지정 소스와 다른 소스가 붙어 있으면 오프라인으로 본다', async () => {
    const { prisma } = createPrisma();
    touchSourceSession(USER_ID, 'ELECTRON', 'session-1'); // 설정은 OBS
    const status = await getSourceStatus(prisma, USER_ID);
    expect(status.online).toBe(false);
  });

  it('같은 세션의 반복 하트비트는 이벤트를 만들지 않는다 (구독자 재조회 폭주 방지)', () => {
    const events: unknown[] = [];
    const unsubscribe = subscribeSongEvents(USER_ID, (event) => events.push(event));

    touchSourceSession(USER_ID, 'OBS', 'session-1'); // 새 연결 → 알림
    touchSourceSession(USER_ID, 'OBS', 'session-1'); // 같은 세션 → 조용히
    touchSourceSession(USER_ID, 'OBS', 'session-1');

    expect(events).toEqual([{ type: 'source' }]);
    unsubscribe();
  });

  it('타임아웃이 지나면 오프라인이고, 다시 붙으면 알림이 나간다', () => {
    vi.useFakeTimers();
    try {
      touchSourceSession(USER_ID, 'OBS', 'session-1');

      const events: unknown[] = [];
      const unsubscribe = subscribeSongEvents(USER_ID, (event) => events.push(event));

      vi.advanceTimersByTime(SOURCE_TIMEOUT_MS + 1);
      expect(isSessionActive(USER_ID, 'session-1')).toBe(false);

      // 끊겼다가 같은 세션으로 돌아와도 새 연결이므로 알린다
      touchSourceSession(USER_ID, 'OBS', 'session-1');
      expect(events).toEqual([{ type: 'source' }]);

      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('창을 여러 개 열면 먼저 잡은 세션이 유지된다 (이중 재생 방지)', () => {
    // 마지막 하트비트가 이기게 두면, 두 기기가 동시에 켜져 있을 때 5초마다 주인이
    // 뒤바뀌어 어느 쪽도 재생하지 못한다 (#85 실측)
    touchSourceSession(USER_ID, 'OBS', 'session-1');
    touchSourceSession(USER_ID, 'OBS', 'session-2');
    expect(isSessionActive(USER_ID, 'session-1')).toBe(true);
    expect(isSessionActive(USER_ID, 'session-2')).toBe(false);

    // 계속 번갈아 보내도 주인은 그대로다
    touchSourceSession(USER_ID, 'OBS', 'session-2');
    touchSourceSession(USER_ID, 'OBS', 'session-1');
    touchSourceSession(USER_ID, 'OBS', 'session-2');
    expect(isSessionActive(USER_ID, 'session-1')).toBe(true);
    expect(isSessionActive(USER_ID, 'session-2')).toBe(false);
  });

  it('주인이 하트비트를 멈추면 타임아웃 뒤에 다른 세션이 이어받는다', () => {
    vi.useFakeTimers();
    try {
      touchSourceSession(USER_ID, 'OBS', 'session-1');
      touchSourceSession(USER_ID, 'OBS', 'session-2');
      expect(isSessionActive(USER_ID, 'session-2')).toBe(false);

      // session-1 이 사라졌다 — session-2 만 계속 보낸다
      vi.advanceTimersByTime(SOURCE_TIMEOUT_MS + 1);
      touchSourceSession(USER_ID, 'OBS', 'session-2');

      expect(isSessionActive(USER_ID, 'session-2')).toBe(true);
      expect(isSessionActive(USER_ID, 'session-1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
