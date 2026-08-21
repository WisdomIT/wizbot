import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Context } from '../../trpc';
import chatbot, { getChatbotDatabaseInitial } from '..';

const USER_ID = 1;

const echoCommands = [
  { id: 1, userId: USER_ID, command: '카페', response: 'https://cafe.naver.com/x', enabled: true },
  {
    id: 2,
    userId: USER_ID,
    command: '방제 수정 도움말',
    response: '방제 수정 사용법입니다',
    enabled: true,
  },
];

const functionCommands = [
  {
    id: 10,
    userId: USER_ID,
    command: '방제 수정',
    function: 'updateChzzkTitle',
    permission: 'MANAGER',
    option: null,
  },
  {
    id: 11,
    userId: USER_ID,
    command: '추가',
    function: 'createCommandEcho',
    permission: 'MANAGER',
    option: null,
  },
  {
    id: 12,
    userId: USER_ID,
    command: '고장',
    function: 'doesNotExist',
    permission: 'VIEWER',
    option: null,
  },
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

describe('비활성 명령어 (#82)', () => {
  beforeEach(() => vi.clearAllMocks());

  /**
   * 디스패처는 commandService.listCommands(..., onlyEnabled=true) 로 조회하므로
   * 비활성 명령어는 애초에 후보 목록에 오지 않는다. 여기서는 그 결과 동작을 고정한다.
   */
  function ctxWithEnabled(echo: object[], func: object[]) {
    return {
      prisma: {
        chatbotEchoCommand: { findMany: vi.fn().mockResolvedValue(echo) },
        chatbotFunctionCommand: { findMany: vi.fn().mockResolvedValue(func) },
      },
    } as unknown as Context;
  }

  it('비활성 명령어는 없는 것처럼 동작한다 (무응답)', async () => {
    // 활성 목록에서 빠진 상태 = 조회 결과가 비어 있음
    const ctx = ctxWithEnabled([], []);
    await expect(chatbot(ctx, message('!카페'))).resolves.toEqual({
      ok: false,
      message: 'Command not found',
    });
  });

  it('비활성 최장일치 명령어가 있으면 짧은 명령어로 폴백된다', async () => {
    // '방제 수정'(function)이 비활성이라 목록에 없고, '방제'만 활성인 상황
    const ctx = ctxWithEnabled(
      [],
      [
        {
          id: 10,
          userId: USER_ID,
          command: '방제',
          function: 'getChzzkTitle',
          permission: 'VIEWER',
          option: null,
          enabled: true,
        },
      ],
    );

    // '!방제 수정 하이' → '방제 수정'이 후보에 없으므로 '방제'가 매칭된다
    const result = await chatbot(ctx, message('!방제 수정 하이'));
    // getChzzkTitle 은 치지직 API 를 타므로 여기서는 매칭 여부만 확인 (not found 가 아니어야 함)
    expect(result.message).not.toBe('Command not found');
  });
});

describe('getCommandListUrl (#73)', () => {
  const OLD_SITE_URL = process.env.PUBLIC_SITE_URL;
  afterEach(() => {
    process.env.PUBLIC_SITE_URL = OLD_SITE_URL;
  });

  function ctxWithChannel(channelId: string | null) {
    return {
      prisma: {
        chatbotEchoCommand: { findMany: vi.fn().mockResolvedValue([]) },
        chatbotFunctionCommand: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 20,
              userId: USER_ID,
              command: '명령어',
              function: 'getCommandListUrl',
              permission: 'VIEWER',
              option: null,
            },
          ]),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(channelId ? { channelId } : null),
        },
      },
    } as unknown as Context;
  }

  it('channelId 경로로 명령어 목록 링크를 응답한다 (#72)', async () => {
    process.env.PUBLIC_SITE_URL = 'https://bot.wisdomit.co.kr';
    const result = await chatbot(
      ctxWithChannel('d9c571e0ecae37fec31711735f95c8f4'),
      message('!명령어'),
    );
    expect(result).toEqual({
      ok: true,
      message: '명령어 목록: https://bot.wisdomit.co.kr/d9c571e0ecae37fec31711735f95c8f4/command',
    });
  });

  it('PUBLIC_SITE_URL 끝의 슬래시는 제거한다', async () => {
    process.env.PUBLIC_SITE_URL = 'https://bot.wisdomit.co.kr/';
    const result = await chatbot(ctxWithChannel('abc'), message('!명령어'));
    expect(result.message).toBe('명령어 목록: https://bot.wisdomit.co.kr/abc/command');
  });

  it('PUBLIC_SITE_URL 미설정이면 깨진 링크 대신 실패 응답', async () => {
    delete process.env.PUBLIC_SITE_URL;
    const result = await chatbot(ctxWithChannel('abc'), message('!명령어'));
    expect(result.ok).toBe(false);
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

  it("기본 function 명령어에 '명령어'(목록 링크)가 포함된다 (#73)", () => {
    const { initialFunction } = getChatbotDatabaseInitial(1);
    expect(initialFunction).toContainEqual(
      expect.objectContaining({ command: '명령어', function: 'getCommandListUrl' }),
    );
  });

  it('기본 명령어 이름은 서로 중복되지 않는다', () => {
    const { initialFunction, initialEcho } = getChatbotDatabaseInitial(1);
    const names = [...initialFunction, ...initialEcho].map((c) => c.command);
    expect(new Set(names).size).toBe(names.length);
  });
});
