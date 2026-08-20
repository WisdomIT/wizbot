import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createShortcut, moveShortcut, updateShortcut } from '../shortcut';

const USER_ID = 1;

function createPrisma() {
  const userShortcut = {
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 5, ...data })),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const prisma = {
    userShortcut,
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaClient;
  return { prisma, userShortcut };
}

const valid = { name: '카페', url: 'https://cafe.naver.com/x', icon: 'Coffee' };

describe('createShortcut 검증', () => {
  beforeEach(() => vi.clearAllMocks());

  it('http(s) 가 아닌 주소는 거부한다 (javascript: 등)', async () => {
    const { prisma } = createPrisma();
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.b/c']) {
      await expect(
        createShortcut(prisma, { userId: USER_ID, ...valid, url }),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('URL 형식이 아니면 거부한다', async () => {
    const { prisma } = createPrisma();
    await expect(
      createShortcut(prisma, { userId: USER_ID, ...valid, url: 'cafe.naver.com' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('이름은 필수이며 20자 이하', async () => {
    const { prisma } = createPrisma();
    await expect(
      createShortcut(prisma, { userId: USER_ID, ...valid, name: '  ' }),
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      createShortcut(prisma, { userId: USER_ID, ...valid, name: 'a'.repeat(21) }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('아이콘 이름 형식을 검증한다', async () => {
    const { prisma } = createPrisma();
    await expect(
      createShortcut(prisma, { userId: USER_ID, ...valid, icon: '<script>' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('개수 상한(12개)을 넘으면 거부', async () => {
    const { prisma, userShortcut } = createPrisma();
    userShortcut.count.mockResolvedValue(12);
    await expect(createShortcut(prisma, { userId: USER_ID, ...valid })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('order 는 마지막 + 1 로 붙는다', async () => {
    const { prisma, userShortcut } = createPrisma();
    userShortcut.findFirst.mockResolvedValue({ order: 3 });
    await createShortcut(prisma, { userId: USER_ID, ...valid });
    expect(userShortcut.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, name: '카페', url: valid.url, icon: 'Coffee', order: 4 },
    });
  });
});

describe('소유권', () => {
  beforeEach(() => vi.clearAllMocks());

  it('남의 링크는 수정할 수 없다 (NOT_FOUND)', async () => {
    const { prisma } = createPrisma(); // findFirst → null (userId 조건 불일치)
    await expect(
      updateShortcut(prisma, { userId: USER_ID, id: 99, ...valid }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('moveShortcut', () => {
  beforeEach(() => vi.clearAllMocks());

  it('경계에서는 아무것도 하지 않는다', async () => {
    const { prisma, userShortcut } = createPrisma();
    userShortcut.findFirst
      .mockResolvedValueOnce({ id: 1, userId: USER_ID, order: 1 }) // 대상
      .mockResolvedValueOnce(null); // 이웃 없음
    await expect(moveShortcut(prisma, USER_ID, 1, 'up')).resolves.toEqual({ moved: false });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('인접 항목과 order 를 교체한다', async () => {
    const { prisma, userShortcut } = createPrisma();
    userShortcut.findFirst
      .mockResolvedValueOnce({ id: 2, userId: USER_ID, order: 2 })
      .mockResolvedValueOnce({ id: 1, userId: USER_ID, order: 1 });
    await expect(moveShortcut(prisma, USER_ID, 2, 'up')).resolves.toEqual({ moved: true });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(userShortcut.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { order: 1 } });
    expect(userShortcut.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { order: 2 } });
  });
});
