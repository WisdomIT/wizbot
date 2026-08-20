import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 유튜브 호출은 외부 API 이므로 mock
vi.mock('../youtube', () => ({
  resolveSong: vi.fn(),
}));

import { removeSong, requestSong } from '../song';
import { resolveSong } from '../youtube';

const USER_ID = 1;
const VIDEO = {
  youtubeId: 'aaaaaaaaaaa',
  title: 'LUCY - 개화',
  uploader: 'LUCY - Topic',
  durationSeconds: 240,
  thumbnailUrl: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg',
};

const DEFAULT_SETTING = {
  userId: USER_ID,
  songActive: true,
  songOneRequestPerUser: false,
  songMaxDurationSeconds: 600,
  songMaxQueueLength: 30,
};

function createPrisma(queue: unknown[] = [], setting = {}) {
  const song = {
    findMany: vi.fn().mockResolvedValue(queue),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 10, ...data })),
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    userSetting: { findUnique: vi.fn().mockResolvedValue({ ...DEFAULT_SETTING, ...setting }) },
    song,
    songHistory: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
  return { prisma, song };
}

function queueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: USER_ID,
    youtubeId: 'bbbbbbbbbbb',
    title: '기존 곡',
    videoUploader: 'ch',
    requester: '다른사람',
    requesterChannelId: 'other-channel',
    durationSeconds: 200,
    order: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

const REQUESTER = { nickname: '위즈', channelId: 'my-channel' };

describe('requestSong', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveSong).mockResolvedValue(VIDEO);
  });

  it('큐에 추가하고 순번을 반환한다 (닉네임·채널ID 모두 저장)', async () => {
    const { prisma, song } = createPrisma([queueItem()]);

    const result = await requestSong(prisma, USER_ID, 'LUCY 개화', REQUESTER);

    expect(result.position).toBe(2);
    expect(song.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        youtubeId: VIDEO.youtubeId,
        requester: '위즈',
        requesterChannelId: 'my-channel',
        durationSeconds: 240,
        order: 2,
      }),
    });
  });

  it('노래 기능이 꺼져 있으면 거부', async () => {
    const { prisma } = createPrisma([], { songActive: false });
    await expect(requestSong(prisma, USER_ID, 'x', REQUESTER)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('대기열 상한을 넘으면 거부', async () => {
    const { prisma } = createPrisma([queueItem(), queueItem({ id: 2 })], { songMaxQueueLength: 2 });
    await expect(requestSong(prisma, USER_ID, 'x', REQUESTER)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('1인 1곡 옵션은 채널ID 로 판별한다 (닉네임 변경과 무관)', async () => {
    const { prisma } = createPrisma(
      [queueItem({ requesterChannelId: 'my-channel', requester: '예전닉네임' })],
      { songOneRequestPerUser: true },
    );
    await expect(requestSong(prisma, USER_ID, 'x', REQUESTER)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('길이 제한을 넘으면 거부', async () => {
    const { prisma } = createPrisma([], { songMaxDurationSeconds: 120 });
    await expect(requestSong(prisma, USER_ID, 'x', REQUESTER)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('대기열에 이미 있는 곡은 거부', async () => {
    const { prisma } = createPrisma([queueItem({ youtubeId: VIDEO.youtubeId })]);
    await expect(requestSong(prisma, USER_ID, 'x', REQUESTER)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

describe('removeSong', () => {
  beforeEach(() => vi.clearAllMocks());

  it('인수 없으면 본인이 신청한 마지막 곡을 취소한다', async () => {
    const { prisma } = createPrisma([
      queueItem({ id: 1, requesterChannelId: 'my-channel', title: '내 첫 곡' }),
      queueItem({ id: 2, requesterChannelId: 'other-channel' }),
      queueItem({ id: 3, requesterChannelId: 'my-channel', title: '내 마지막 곡' }),
    ]);

    const removed = await removeSong(prisma, USER_ID, {
      requester: REQUESTER,
      canRemoveOthers: false,
    });

    expect(removed.title).toBe('내 마지막 곡');
  });

  it('신청한 곡이 없으면 NOT_FOUND', async () => {
    const { prisma } = createPrisma([queueItem({ requesterChannelId: 'other-channel' })]);
    await expect(
      removeSong(prisma, USER_ID, { requester: REQUESTER, canRemoveOthers: false }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('권한 없이 순번 지정하면 거부', async () => {
    const { prisma } = createPrisma([queueItem()]);
    await expect(
      removeSong(prisma, USER_ID, { position: 1, requester: REQUESTER, canRemoveOthers: false }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('매니저는 순번으로 남의 곡을 삭제할 수 있다', async () => {
    const { prisma } = createPrisma([
      queueItem({ id: 1, title: '1번곡' }),
      queueItem({ id: 2, title: '2번곡' }),
    ]);

    const removed = await removeSong(prisma, USER_ID, {
      position: 2,
      requester: { nickname: '매니저', channelId: 'mgr' },
      canRemoveOthers: true,
    });

    expect(removed.title).toBe('2번곡');
    // 삭제는 이력(CANCELED)과 함께 트랜잭션으로
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('없는 순번은 NOT_FOUND', async () => {
    const { prisma } = createPrisma([queueItem()]);
    await expect(
      removeSong(prisma, USER_ID, {
        position: 5,
        requester: REQUESTER,
        canRemoveOthers: true,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('빈 대기열은 NOT_FOUND', async () => {
    const { prisma } = createPrisma([]);
    await expect(
      removeSong(prisma, USER_ID, { requester: REQUESTER, canRemoveOthers: true }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
