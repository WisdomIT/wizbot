import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addAdmin, deleteStreamer, removeAdmin, setStreamerHidden } from '../adminUsers';

function createPrisma() {
  const admin = {
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(2),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 9, ...data })),
    delete: vi.fn().mockResolvedValue({}),
  };
  const user = {
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const whitelist = { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) };
  return { prisma: { admin, user, whitelist } as unknown as PrismaClient, admin, user, whitelist };
}

describe('removeAdmin 보호 장치', () => {
  beforeEach(() => vi.clearAllMocks());

  it('자기 자신은 삭제할 수 없다', async () => {
    const { prisma } = createPrisma();
    await expect(removeAdmin(prisma, 1, 1)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('마지막 관리자는 삭제할 수 없다', async () => {
    const { prisma, admin } = createPrisma();
    admin.findUnique.mockResolvedValue({ id: 2, email: 'a@b.c' });
    admin.count.mockResolvedValue(1);
    await expect(removeAdmin(prisma, 2, 1)).rejects.toMatchObject({
      message: '마지막 관리자 계정은 삭제할 수 없습니다.',
    });
    expect(admin.delete).not.toHaveBeenCalled();
  });

  it('정상 삭제', async () => {
    const { prisma, admin } = createPrisma();
    admin.findUnique.mockResolvedValue({ id: 2, email: 'a@b.c' });
    await expect(removeAdmin(prisma, 2, 1)).resolves.toEqual({ id: 2, email: 'a@b.c' });
    expect(admin.delete).toHaveBeenCalledWith({ where: { id: 2 } });
  });
});

describe('addAdmin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('이메일을 소문자·trim 정규화해 저장한다', async () => {
    const { prisma, admin } = createPrisma();
    await addAdmin(prisma, '  Admin@Example.COM ');
    expect(admin.create).toHaveBeenCalledWith({
      data: { email: 'admin@example.com' },
      select: { id: true, email: true },
    });
  });

  it('중복 이메일은 CONFLICT', async () => {
    const { prisma, admin } = createPrisma();
    admin.findUnique.mockResolvedValue({ id: 1, email: 'a@b.c' });
    await expect(addAdmin(prisma, 'a@b.c')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('스트리머 관리', () => {
  beforeEach(() => vi.clearAllMocks());

  it('없는 유저 hidden 토글/삭제는 NOT_FOUND', async () => {
    const { prisma } = createPrisma();
    await expect(setStreamerHidden(prisma, 99, true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deleteStreamer(prisma, 99)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('탈퇴 처리는 user.delete (cascade 는 스키마가 보장) — 기본은 화이트리스트를 남긴다', async () => {
    const { prisma, user, whitelist } = createPrisma();
    user.findUnique.mockResolvedValue({ id: 1, channelId: 'abc', channelName: '테스트' });
    await deleteStreamer(prisma, 1);
    expect(user.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(whitelist.deleteMany).not.toHaveBeenCalled();
  });

  it('removeWhitelist 면 화이트리스트도 채널 ID 로 지운다', async () => {
    const { prisma, user, whitelist } = createPrisma();
    user.findUnique.mockResolvedValue({ id: 1, channelId: 'abc', channelName: '테스트' });
    await deleteStreamer(prisma, 1, { removeWhitelist: true });
    expect(whitelist.deleteMany).toHaveBeenCalledWith({ where: { channelId: 'abc' } });
  });
});
