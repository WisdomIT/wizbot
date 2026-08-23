import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 유튜브 호출은 외부 API 이므로 mock
vi.mock('../youtube', () => ({
  resolveSong: vi.fn(),
  getPlaylistVideos: vi.fn(),
}));

import {
  addFavoriteItem,
  deleteFavorite,
  enqueueFavorite,
  importPlaylist,
  pickAutoPlayItem,
  reorderFavoriteItems,
  setDefaultFavorite,
} from '../songFavorite';
import { getPlaylistVideos, resolveSong } from '../youtube';

const USER_ID = 1;
const FAVORITE = { id: 5, userId: USER_ID, name: '기본', isDefault: true, createdAt: new Date() };

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    favoriteId: FAVORITE.id,
    youtubeId: 'aaaaaaaaaaa',
    title: '곡',
    videoUploader: 'ch',
    durationSeconds: 200,
    order: 1,
    ...overrides,
  };
}

function createPrisma(items: unknown[] = [], queue: unknown[] = []) {
  const songFavoriteItem = {
    findMany: vi.fn().mockResolvedValue(items),
    findFirst: vi.fn().mockResolvedValue(null),
    count: vi.fn().mockResolvedValue(items.length),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 99, ...data })),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: items.length }),
  };
  const songFavorite = {
    findFirst: vi.fn().mockResolvedValue(FAVORITE),
    findMany: vi.fn().mockResolvedValue([FAVORITE]),
    count: vi.fn().mockResolvedValue(1),
    create: vi.fn().mockResolvedValue(FAVORITE),
    update: vi.fn().mockResolvedValue(FAVORITE),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    delete: vi.fn().mockResolvedValue(FAVORITE),
  };
  const song = {
    findMany: vi.fn().mockResolvedValue(queue),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = {
    songFavorite,
    songFavoriteItem,
    song,
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
  return { prisma, songFavorite, songFavoriteItem, song };
}

describe('songFavorite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('이미 담긴 곡은 다시 담지 않는다', async () => {
    const { prisma, songFavoriteItem } = createPrisma();
    vi.mocked(resolveSong).mockResolvedValue({
      youtubeId: 'aaaaaaaaaaa',
      title: '곡',
      uploader: 'ch',
      durationSeconds: 200,
      thumbnailUrl: null,
    });
    songFavoriteItem.findFirst.mockResolvedValue(item());

    await expect(addFavoriteItem(prisma, USER_ID, FAVORITE.id, 'aaaaaaaaaaa')).rejects.toThrow(
      '이미 담겨 있는 곡',
    );
    expect(songFavoriteItem.create).not.toHaveBeenCalled();
  });

  it('재생목록 가져오기는 이미 담긴 곡을 건너뛴다', async () => {
    const { prisma, songFavoriteItem } = createPrisma();
    songFavoriteItem.findMany.mockResolvedValue([{ youtubeId: 'aaaaaaaaaaa' }]);
    vi.mocked(getPlaylistVideos).mockResolvedValue({
      title: '재생목록',
      truncated: false,
      videos: [
        { youtubeId: 'aaaaaaaaaaa', title: 'A', uploader: 'ch', durationSeconds: 1, thumbnailUrl: null },
        { youtubeId: 'bbbbbbbbbbb', title: 'B', uploader: 'ch', durationSeconds: 2, thumbnailUrl: null },
      ],
    });

    const result = await importPlaylist(prisma, USER_ID, FAVORITE.id, 'https://x/?list=PL1');

    expect(result).toMatchObject({ playlistTitle: '재생목록', added: 1, skipped: 1 });
    expect(songFavoriteItem.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ youtubeId: 'bbbbbbbbbbb' })],
    });
  });

  it('대표 지정은 나머지를 모두 해제한 뒤 지정한다', async () => {
    const { prisma, songFavorite } = createPrisma();
    await setDefaultFavorite(prisma, USER_ID, FAVORITE.id);
    expect(songFavorite.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { isDefault: false },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('대표를 삭제하면 남은 것 중 가장 오래된 것이 대표가 된다', async () => {
    const { prisma, songFavorite } = createPrisma();
    songFavorite.findFirst
      .mockResolvedValueOnce(FAVORITE) // 소유 확인
      .mockResolvedValueOnce({ ...FAVORITE, id: 7, isDefault: false }); // 승계 대상

    await deleteFavorite(prisma, USER_ID, FAVORITE.id);

    expect(songFavorite.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isDefault: true },
    });
  });

  it('대기열에 이미 있는 곡은 빼고 넣는다', async () => {
    const { prisma, song } = createPrisma(
      [item({ id: 1, youtubeId: 'aaaaaaaaaaa' }), item({ id: 2, youtubeId: 'bbbbbbbbbbb' })],
      [{ youtubeId: 'aaaaaaaaaaa', order: 4 }],
    );

    const result = await enqueueFavorite(prisma, USER_ID, FAVORITE.id, { requester: '위즈' });

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(song.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ youtubeId: 'bbbbbbbbbbb', order: 5, requester: '위즈' })],
    });
  });

  it('목록과 어긋난 id 로는 재정렬하지 않는다', async () => {
    const { prisma } = createPrisma([item({ id: 1 }), item({ id: 2, order: 2 })]);
    await expect(reorderFavoriteItems(prisma, USER_ID, FAVORITE.id, [1, 3])).rejects.toThrow(
      '목록이 변경',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('자동 재생은 방금 재생한 곡을 다시 고르지 않는다', async () => {
    const { prisma } = createPrisma([
      item({ id: 1, youtubeId: 'aaaaaaaaaaa' }),
      item({ id: 2, youtubeId: 'bbbbbbbbbbb' }),
    ]);

    for (let i = 0; i < 20; i += 1) {
      const picked = await pickAutoPlayItem(prisma, USER_ID, 'aaaaaaaaaaa');
      expect(picked?.youtubeId).toBe('bbbbbbbbbbb');
    }
  });

  it('대표 즐겨찾기가 없으면 자동 재생하지 않는다', async () => {
    const { prisma, songFavorite } = createPrisma([item()]);
    songFavorite.findFirst.mockResolvedValue(null);
    await expect(pickAutoPlayItem(prisma, USER_ID)).resolves.toBeNull();
  });
});
