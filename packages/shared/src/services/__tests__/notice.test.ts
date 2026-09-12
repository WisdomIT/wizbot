import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { adminReads, listAdmin } from '../notice';

const user = (id: number, followerCount: number | null) => ({ id, channelId: `c${id}`, channelName: `n${id}`, channelImageUrl: null, followerCount });

describe('공지 읽음 집계 (#298)', () => {
  it('listAdmin — 공지마다 읽은 수, 분모는 전체 스트리머 수', async () => {
    const prisma = {
      notice: { findMany: vi.fn().mockResolvedValue([{ id: 2, title: 'b', popup: true, _count: { reads: 3 } }, { id: 1, title: 'a', popup: false, _count: { reads: 0 } }]) },
      user: { count: vi.fn().mockResolvedValue(10) },
    } as unknown as PrismaClient;
    await expect(listAdmin(prisma)).resolves.toEqual({
      notices: [{ id: 2, title: 'b', popup: true, readCount: 3 }, { id: 1, title: 'a', popup: false, readCount: 0 }],
      streamerCount: 10,
    });
  });

  it('adminReads — 읽음/안 읽음으로 나누고 둘 다 팔로워 많은 순 (모르면 뒤)', async () => {
    const readAt = new Date('2026-09-12T00:00:00Z');
    const prisma = {
      notice: { findUnique: vi.fn().mockResolvedValue({ id: 5 }) },
      noticeRead: { findMany: vi.fn().mockResolvedValue([{ readAt, user: user(1, 10) }, { readAt, user: user(2, 500) }]) },
      user: { findMany: vi.fn().mockResolvedValue([user(1, 10), user(2, 500), user(3, null), user(4, 200)]) },
    } as unknown as PrismaClient;
    const result = await adminReads(prisma, 5);
    expect(result.read.map((row) => row.id)).toEqual([2, 1]);
    expect(result.read[0]).toMatchObject({ id: 2, readAt });
    expect(result.unread.map((row) => row.id)).toEqual([4, 3]);
  });

  it('없는 공지는 NOT_FOUND', async () => {
    const prisma = { notice: { findUnique: vi.fn().mockResolvedValue(null) } } as unknown as PrismaClient;
    await expect(adminReads(prisma, 99)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
