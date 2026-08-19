import { beforeEach, describe, expect, it, vi } from 'vitest';

// 치지직 토큰 조회는 외부 API를 타므로 mock
vi.mock('../../lib/accessToken', () => ({
  getAccessToken: vi.fn().mockResolvedValue('test-access-token'),
}));

import type { Context } from '../../trpc';
import chatbot, { getChatbotDatabaseInitial } from '..';

const USER_ID = 1;

const echoCommands = [
  { id: 1, userId: USER_ID, command: '카페', response: 'https://cafe.naver.com/x' },
  { id: 2, userId: USER_ID, command: '방제 수정 도움말', response: '방제 수정 사용법입니다' },
];

const functionCommands = [
  { id: 10, userId: USER_ID, command: '방제 수정', function: 'updateChzzkTitle', permission: 'MANAGER', option: null },
  { id: 11, userId: USER_ID, command: '추가', function: 'createCommandEcho', permission: 'MANAGER', option: null },
  { id: 12, userId: USER_ID, command: '고장', function: 'doesNotExist', permission: 'VIEWER', option: null },
];

function createCtx() {
  const echo = {
    findMany: vi.fn().mockResolvedValue(echoCommands),
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }: { data: object }) => ({ id: 99, ...data })),
  };
  const func = {
    findMany: vi.fn().mockResolvedValue(functionCommands),
    findFirst: vi.fn().mockResolvedValue(null),
  };
  const ctx = {
    prisma: { chatbotEchoCommand: echo, chatbotFunctionCommand: func },
  } as unknown as Context;
  return { ctx, echo, func };
}

function message(content: string, senderRole: 'STREAMER' | 'MANAGER' | 'VIEWER' = 'VIEWER') {
  return { userId: USER_ID, senderNickname: 'tester', senderRole, content };
}

describe('chatbot 디스패처', () => {
  beforeEach(() => vi.clearAllMocks());

  it('echo 명령어는 저장된 응답을 그대로 돌려준다', async () => {
    const { ctx } = createCtx();
    await expect(chatbot(ctx, message('!카페'))).resolves.toEqual({
      ok: true,
      message: 'https://cafe.naver.com/x',
    });
  });

  it('echo 명령어는 권한과 무관하게 인수가 붙어도 매칭된다', async () => {
    const { ctx } = createCtx();
    const result = await chatbot(ctx, message('!카페 알려줘'));
    expect(result.ok).toBe(true);
    expect(result.message).toBe('https://cafe.naver.com/x');
  });

  it('없는 명령어는 ok:false / Command not found', async () => {
    const { ctx } = createCtx();
    await expect(chatbot(ctx, message('!없는명령'))).resolves.toEqual({
      ok: false,
      message: 'Command not found',
    });
  });

  it('권한이 부족한 function 명령어는 실행하지 않고 안내한다', async () => {
    const { ctx } = createCtx();
    await expect(chatbot(ctx, message('!방제 수정 하이', 'VIEWER'))).resolves.toEqual({
      ok: true,
      message: '권한이 없습니다',
    });
  });

  it('echo와 function이 모두 매칭되면 더 긴 명령어(echo)를 우선한다', async () => {
    const { ctx } = createCtx();
    // '방제 수정 도움말'(echo, 길다) vs '방제 수정'(function)
    await expect(chatbot(ctx, message('!방제 수정 도움말', 'VIEWER'))).resolves.toEqual({
      ok: true,
      message: '방제 수정 사용법입니다',
    });
  });

  it('DB에 등록된 function 이름이 레지스트리에 없으면 Function not found', async () => {
    const { ctx } = createCtx();
    await expect(chatbot(ctx, message('!고장'))).resolves.toEqual({
      ok: false,
      message: 'Function not found',
    });
  });

  it('권한이 충분하면 function을 실행한다 (createCommandEcho)', async () => {
    const { ctx, echo } = createCtx();
    const result = await chatbot(ctx, message('!추가 인사 안녕하세요 여러분', 'MANAGER'));

    expect(result).toEqual({ ok: true, message: '인사 명령어가 생성되었습니다.' });
    expect(echo.create).toHaveBeenCalledWith({
      data: { userId: USER_ID, command: '인사', response: '안녕하세요 여러분' },
    });
  });

  it('createCommandEcho: 이미 존재하는 명령어면 생성하지 않는다', async () => {
    const { ctx, echo } = createCtx();
    echo.findFirst.mockResolvedValueOnce(echoCommands[0]);

    const result = await chatbot(ctx, message('!추가 카페 중복', 'MANAGER'));

    expect(result).toEqual({ ok: true, message: '이미 존재하는 명령어입니다.' });
    expect(echo.create).not.toHaveBeenCalled();
  });

  it('createCommandEcho: 응답이 없으면 사용법을 안내한다', async () => {
    const { ctx, echo } = createCtx();
    const result = await chatbot(ctx, message('!추가 인사', 'MANAGER'));

    expect(result.ok).toBe(true);
    expect(result.message).toContain('!추가 인사 <응답>');
    expect(echo.create).not.toHaveBeenCalled();
  });
});

describe('getChatbotDatabaseInitial', () => {
  it('기본 function/echo 명령어를 해당 userId로 생성한다', () => {
    const { initialFunction, initialEcho } = getChatbotDatabaseInitial(42);

    expect(initialFunction.length).toBeGreaterThan(0);
    expect(initialEcho.length).toBeGreaterThan(0);
    expect(initialFunction.every((c) => c.userId === 42)).toBe(true);
    expect(initialEcho.every((c) => c.userId === 42)).toBe(true);
  });

  it('기본 명령어 이름은 서로 중복되지 않는다', () => {
    const { initialFunction, initialEcho } = getChatbotDatabaseInitial(1);
    const names = [...initialFunction, ...initialEcho].map((c) => c.command);
    expect(new Set(names).size).toBe(names.length);
  });
});
