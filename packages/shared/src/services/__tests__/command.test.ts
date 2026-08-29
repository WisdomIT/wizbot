import type { PrismaClient } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertCommandNameAvailable,
  createEchoCommand,
  createFunctionCommand,
  deleteEchoCommand,
  normalizeCommandName,
  setCommandEnabled,
  updateEchoCommand,
} from '../command';
import { ServiceError } from '../errors';
import { deleteRepeat, updateRepeat } from '../repeat';

const USER_ID = 1;

function createPrisma() {
  const echo = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi
      .fn()
      .mockImplementation(async ({ data }: { data: object }) => ({ id: 100, ...data })),
    update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 1, ...data })),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const func = {
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi
      .fn()
      .mockImplementation(async ({ data }: { data: object }) => ({ id: 200, ...data })),
    update: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
  const repeat = {
    findFirst: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 1, ...data })),
    delete: vi.fn().mockImplementation(async () => ({ id: 1, response: 'r', interval: 60 })),
  };
  const prisma = {
    chatbotEchoCommand: echo,
    chatbotFunctionCommand: func,
    chatbotRepeat: repeat,
  } as unknown as PrismaClient;
  return { prisma, echo, func, repeat };
}

describe('normalizeCommandName', () => {
  it("앞의 '!'와 양끝 공백을 제거한다", () => {
    expect(normalizeCommandName('!카페')).toBe('카페');
    expect(normalizeCommandName('  !카페  ')).toBe('카페');
    expect(normalizeCommandName('카페')).toBe('카페');
    expect(normalizeCommandName('! ')).toBe('');
  });
});

describe('assertCommandNameAvailable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('echo/function 어느 쪽에도 없으면 통과', async () => {
    const { prisma } = createPrisma();
    await expect(assertCommandNameAvailable(prisma, USER_ID, '카페')).resolves.toBeUndefined();
  });

  it('echo에 같은 이름이 있으면 CONFLICT', async () => {
    const { prisma, echo } = createPrisma();
    echo.findFirst.mockResolvedValue({ id: 1, userId: USER_ID, command: '카페', response: 'x' });
    await expect(assertCommandNameAvailable(prisma, USER_ID, '카페')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('function에 같은 이름이 있어도 CONFLICT (테이블 교차 검사)', async () => {
    const { prisma, func } = createPrisma();
    func.findFirst.mockResolvedValue({ id: 5, userId: USER_ID, command: '카페' });
    await expect(assertCommandNameAvailable(prisma, USER_ID, '카페')).rejects.toBeInstanceOf(
      ServiceError,
    );
  });

  it('수정 중인 자기 자신은 충돌로 보지 않는다', async () => {
    const { prisma, echo } = createPrisma();
    echo.findFirst.mockResolvedValue({ id: 1, userId: USER_ID, command: '카페', response: 'x' });
    await expect(
      assertCommandNameAvailable(prisma, USER_ID, '카페', { type: 'echo', id: 1 }),
    ).resolves.toBeUndefined();
    // 같은 이름이지만 다른 id면 충돌
    await expect(
      assertCommandNameAvailable(prisma, USER_ID, '카페', { type: 'echo', id: 2 }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('활성/비활성 (#82)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('이름 중복 검사는 비활성 명령어도 포함한다 (다시 켤 때 충돌 방지)', async () => {
    const { prisma, echo } = createPrisma();
    // 꺼져 있는 '카페' 가 이미 있는 상황 — enabled 조건 없이 조회하므로 그대로 걸린다
    echo.findFirst.mockResolvedValue({
      id: 1,
      userId: USER_ID,
      command: '카페',
      response: 'x',
      enabled: false,
    });

    await expect(assertCommandNameAvailable(prisma, USER_ID, '카페')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('setCommandEnabled 는 본인 명령어만 토글한다', async () => {
    const { prisma, echo } = createPrisma();
    echo.findFirst.mockResolvedValue({ id: 1, userId: USER_ID, command: '카페', response: 'x' });

    await setCommandEnabled(prisma, USER_ID, 1, 'echo', false);
    expect(echo.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { enabled: false } });
  });

  it('남의 명령어 토글은 NOT_FOUND', async () => {
    const { prisma } = createPrisma(); // findFirst → null
    await expect(setCommandEnabled(prisma, USER_ID, 99, 'echo', false)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('createEchoCommand / createFunctionCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it("'!'가 붙은 이름도 정규화해서 저장한다", async () => {
    const { prisma, echo } = createPrisma();
    await createEchoCommand(prisma, { userId: USER_ID, command: '!카페', response: 'https://x' });
    expect(echo.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, command: '카페', response: 'https://x' },
    });
  });

  it('이름이나 응답이 비어 있으면 INVALID_INPUT', async () => {
    const { prisma } = createPrisma();
    await expect(
      createEchoCommand(prisma, { userId: USER_ID, command: '!', response: 'x' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      createEchoCommand(prisma, { userId: USER_ID, command: '카페', response: '' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('function 명령어 생성 시 option 미지정은 undefined로 넘긴다', async () => {
    const { prisma, func } = createPrisma();
    await createFunctionCommand(prisma, {
      userId: USER_ID,
      command: '방제',
      permission: 'VIEWER',
      function: 'getChzzkTitle',
    });
    expect(func.create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        command: '방제',
        permission: 'VIEWER',
        function: 'getChzzkTitle',
        option: undefined,
      },
    });
  });
});

describe('updateEchoCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('없는 id면 NOT_FOUND', async () => {
    const { prisma } = createPrisma();
    await expect(
      updateEchoCommand(prisma, { userId: USER_ID, id: 99, response: 'x' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('command를 생략하면 기존 이름을 유지하고 응답만 바꾼다', async () => {
    const { prisma, echo } = createPrisma();
    echo.findFirst.mockResolvedValueOnce({
      id: 1,
      userId: USER_ID,
      command: '카페',
      response: 'old',
    });
    await updateEchoCommand(prisma, { userId: USER_ID, id: 1, response: 'new' });
    expect(echo.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { command: '카페', response: 'new' },
    });
  });

  it('이름을 바꿀 때만 중복 검사를 한다', async () => {
    const { prisma, echo, func } = createPrisma();
    // getEchoCommand → 기존 row, 이후 findFirst는 중복 검사용
    echo.findFirst
      .mockResolvedValueOnce({ id: 1, userId: USER_ID, command: '카페', response: 'old' })
      .mockResolvedValueOnce(null);
    func.findFirst.mockResolvedValueOnce({ id: 7, userId: USER_ID, command: '방제' });

    await expect(
      updateEchoCommand(prisma, { userId: USER_ID, id: 1, command: '방제', response: 'x' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(echo.update).not.toHaveBeenCalled();
  });
});

describe('deleteEchoCommand', () => {
  it('삭제된 row 수를 반환한다', async () => {
    const { prisma, echo } = createPrisma();
    echo.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(deleteEchoCommand(prisma, USER_ID, 1)).resolves.toBe(0);
    await expect(deleteEchoCommand(prisma, USER_ID, 1)).resolves.toBe(1);
  });
});

describe('repeat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('없는 반복 메시지는 NOT_FOUND', async () => {
    const { prisma } = createPrisma();
    await expect(deleteRepeat(prisma, USER_ID, 1)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('주기가 0 이하면 INVALID_INPUT', async () => {
    const { prisma } = createPrisma();
    await expect(
      updateRepeat(prisma, { userId: USER_ID, id: 1, response: 'x', interval: 0 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
