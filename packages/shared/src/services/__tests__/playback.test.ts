import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  advanceToNext,
  playSongNow,
  seek,
  getSourceStatus,
  isSessionActive,
  reportEnded,
  skipToNext,
  touchSourceSession,
} from '../playback';
import { clearSource } from '../songEvents';

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

  it('창을 여러 개 열면 마지막 세션만 활성 (이중 재생 방지)', () => {
    touchSourceSession(USER_ID, 'OBS', 'session-1');
    touchSourceSession(USER_ID, 'OBS', 'session-2');
    expect(isSessionActive(USER_ID, 'session-1')).toBe(false);
    expect(isSessionActive(USER_ID, 'session-2')).toBe(true);
  });
});
