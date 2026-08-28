import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const channelsGet = vi.fn();
vi.mock('../chzzkClient', () => ({
  getChzzkAppClient: () => ({ channels: { get: channelsGet } }),
}));

import { refreshAllChannelInfo } from '../account';

function createPrisma(users: { id: number; channelId: string; channelName: string; channelImageUrl: string | null }[]) {
  const user = { findMany: vi.fn().mockResolvedValue(users), update: vi.fn().mockResolvedValue({}) };
  return { prisma: { user } as unknown as PrismaClient, user };
}

describe('refreshAllChannelInfo — 30분 주기 채널 정보 동기화 (#77)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('바뀐 채널만 update 한다', async () => {
    const { prisma, user } = createPrisma([
      { id: 1, channelId: 'a', channelName: '같음', channelImageUrl: 'img-a' },
      { id: 2, channelId: 'b', channelName: '옛이름', channelImageUrl: 'img-b' },
      { id: 3, channelId: 'c', channelName: '같음', channelImageUrl: 'old' },
    ]);
    channelsGet.mockResolvedValue([
      { channelId: 'a', channelName: '같음', channelImageUrl: 'img-a' },
      { channelId: 'b', channelName: '새이름', channelImageUrl: 'img-b' },
      { channelId: 'c', channelName: '같음', channelImageUrl: 'new' },
    ]);
    await expect(refreshAllChannelInfo(prisma)).resolves.toEqual({ checked: 3, updated: 2 });
    expect(user.update).toHaveBeenCalledTimes(2);
    expect(user.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { channelName: '새이름', channelImageUrl: 'img-b' } });
    expect(user.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { channelName: '같음', channelImageUrl: 'new' } });
  });

  it('치지직이 돌려주지 않은 채널(삭제·비공개)은 건드리지 않는다', async () => {
    const { prisma, user } = createPrisma([{ id: 1, channelId: 'gone', channelName: 'x', channelImageUrl: null }]);
    channelsGet.mockResolvedValue([]);
    await expect(refreshAllChannelInfo(prisma)).resolves.toEqual({ checked: 1, updated: 0 });
    expect(user.update).not.toHaveBeenCalled();
  });

  it('치지직 조회 한도(20)에 맞춰 나눠 부른다', async () => {
    const users = Array.from({ length: 45 }, (_, i) => ({ id: i, channelId: `c${i}`, channelName: 'n', channelImageUrl: null }));
    const { prisma } = createPrisma(users);
    channelsGet.mockResolvedValue([]);
    await refreshAllChannelInfo(prisma);
    expect(channelsGet).toHaveBeenCalledTimes(3);
    expect(channelsGet.mock.calls.map((c) => c[0].length)).toEqual([20, 20, 5]);
  });
});
