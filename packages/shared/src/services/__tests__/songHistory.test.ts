import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPublicHistory,
  getPublicNowPlaying,
  getPublicPlaylist,
  listHistory,
  setHistoryHidden,
} from '../songHistory';

const USER_ID = 1;
const CHANNEL_ID = 'chan-1';

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    userId: USER_ID,
    youtubeId: 'aaaaaaaaaaa',
    title: '곡',
    videoUploader: 'ch',
    requester: '위즈',
    requesterChannelId: 'other',
    durationSeconds: 200,
    status: 'PLAYED',
    resolvedBy: null,
    hiddenFromViewers: false,
    requestedAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

function createPrisma(rows: unknown[] = [], setting: Record<string, unknown> | null = {}) {
  const songHistory = {
    findMany: vi.fn().mockResolvedValue(rows),
    findFirst: vi.fn().mockResolvedValue(entry()),
    update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ ...data })),
  };
  const prisma = {
    songHistory,
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: USER_ID, channelName: '위즈' }),
    },
    userSetting: { findUnique: vi.fn().mockResolvedValue(setting) },
    songPlayback: { findUnique: vi.fn().mockResolvedValue(null) },
    song: { findMany: vi.fn().mockResolvedValue([]) },
    chatbotFunctionCommand: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
  return { prisma, songHistory };
}

describe('songHistory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('한 페이지를 넘게 가져오면 다음 커서를 돌려준다', async () => {
    // limit(2) + 1 건을 돌려주도록 mock
    const rows = [entry({ id: 3 }), entry({ id: 2 }), entry({ id: 1 })];
    const { prisma } = createPrisma(rows);

    const page = await listHistory(prisma, USER_ID, { limit: 2 });

    expect(page.items.map((item) => item.id)).toEqual([3, 2]);
    expect(page.nextCursor).toBe(2);
  });

  it('마지막 페이지면 커서가 null 이다', async () => {
    const { prisma } = createPrisma([entry({ id: 3 })]);
    const page = await listHistory(prisma, USER_ID, { limit: 2 });
    expect(page.nextCursor).toBeNull();
  });

  it('검색어는 제목과 신청자 모두에서 찾는다', async () => {
    const { prisma, songHistory } = createPrisma([]);
    await listHistory(prisma, USER_ID, { query: '개화', status: 'PLAYED' });

    expect(songHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
          status: 'PLAYED',
          OR: [{ title: { contains: '개화' } }, { requester: { contains: '개화' } }],
        }),
      }),
    );
  });

  it('남의 기록은 숨김 처리할 수 없다', async () => {
    const { prisma, songHistory } = createPrisma();
    songHistory.findFirst.mockResolvedValue(null);
    await expect(setHistoryHidden(prisma, USER_ID, 10, true)).rejects.toThrow('없는 기록');
  });

  it('공개 설정이 꺼져 있으면 시청자 기록 조회를 막는다', async () => {
    const { prisma } = createPrisma([], { songHistoryPublic: false });
    await expect(getPublicHistory(prisma, CHANNEL_ID)).rejects.toThrow('공개하지 않습니다');
  });

  it('시청자 기록은 숨긴 항목을 제외한다', async () => {
    const { prisma, songHistory } = createPrisma([], { songHistoryPublic: true });
    await getPublicHistory(prisma, CHANNEL_ID);

    expect(songHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, hiddenFromViewers: false }),
      }),
    );
  });

  it('없는 채널은 404 로 막는다', async () => {
    const { prisma } = createPrisma();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(getPublicPlaylist(prisma, 'nope')).rejects.toThrow('존재하지 않는 채널');
  });

  it('재생 바는 정지 상태면 아무것도 돌려주지 않는다', async () => {
    const { prisma } = createPrisma([], {});
    vi.mocked(prisma.songPlayback.findUnique).mockResolvedValue({
      status: 'STOPPED',
      youtubeId: 'aaaaaaaaaaa',
    } as never);

    await expect(getPublicNowPlaying(prisma, CHANNEL_ID)).resolves.toEqual({ playback: null });
  });

  it('재생 바는 현재 곡만 돌려준다 (대기열·명령어는 싣지 않는다)', async () => {
    const { prisma } = createPrisma([], {});
    vi.mocked(prisma.songPlayback.findUnique).mockResolvedValue({
      status: 'PLAYING',
      youtubeId: 'aaaaaaaaaaa',
      title: '곡',
      videoUploader: 'ch',
      requester: '위즈',
      durationSeconds: 200,
      positionSeconds: 12,
    } as never);

    const result = await getPublicNowPlaying(prisma, CHANNEL_ID);

    expect(result.playback).toMatchObject({ youtubeId: 'aaaaaaaaaaa', positionSeconds: 12 });
    expect(prisma.song.findMany).not.toHaveBeenCalled();
    expect(prisma.chatbotFunctionCommand.findMany).not.toHaveBeenCalled();
  });

  it('플레이리스트는 비활성 명령어를 빼고 조회한다', async () => {
    const { prisma } = createPrisma([], { songActive: true, songHistoryPublic: false });
    const result = await getPublicPlaylist(prisma, CHANNEL_ID);

    expect(result.songActive).toBe(true);
    expect(prisma.chatbotFunctionCommand.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: USER_ID, enabled: true }),
    });
  });
});
