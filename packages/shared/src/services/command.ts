import type { ChatbotPermission, PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

export type CommandType = 'echo' | 'function';

/** 명령어 이름 정규화: 앞의 '!' 제거 + 양끝 공백 제거 */
export function normalizeCommandName(command: string): string {
  const trimmed = command.trim();
  return (trimmed.startsWith('!') ? trimmed.slice(1) : trimmed).trim();
}

/* ---------- 조회 ---------- */

/**
 * 명령어 목록.
 * @param onlyEnabled 켜진 명령어만 (채팅 디스패처·시청자 공개 목록). 콘솔은 전부 필요하므로 기본 false (#82)
 */
export async function listCommands(prisma: PrismaClient, userId: number, onlyEnabled = false) {
  const where = onlyEnabled ? { userId, enabled: true } : { userId };
  const [echo, func] = await Promise.all([
    prisma.chatbotEchoCommand.findMany({ where }),
    prisma.chatbotFunctionCommand.findMany({ where }),
  ]);
  return { echo, function: func };
}

/**
 * 활성/비활성 토글 (#82).
 * ⚠️ 이름 중복 검사(assertCommandNameAvailable)는 비활성 명령어도 포함한다 —
 *    꺼둔 이름을 다른 명령어가 가져가면 다시 켤 때 충돌하기 때문.
 */
export async function setCommandEnabled(
  prisma: PrismaClient,
  userId: number,
  id: number,
  type: CommandType,
  enabled: boolean,
) {
  if (type === 'echo') {
    const existing = await getEchoCommand(prisma, userId, id);
    return prisma.chatbotEchoCommand.update({ where: { id: existing.id }, data: { enabled } });
  }
  const existing = await getFunctionCommand(prisma, userId, id);
  return prisma.chatbotFunctionCommand.update({ where: { id: existing.id }, data: { enabled } });
}

export function findEchoCommandByName(prisma: PrismaClient, userId: number, command: string) {
  return prisma.chatbotEchoCommand.findFirst({ where: { userId, command } });
}

export function findFunctionCommandByName(prisma: PrismaClient, userId: number, command: string) {
  return prisma.chatbotFunctionCommand.findFirst({ where: { userId, command } });
}

export async function getEchoCommand(prisma: PrismaClient, userId: number, id: number) {
  const found = await prisma.chatbotEchoCommand.findFirst({ where: { userId, id } });
  if (!found) throw new ServiceError('NOT_FOUND', '존재하지 않는 명령어입니다.');
  return found;
}

export async function getFunctionCommand(prisma: PrismaClient, userId: number, id: number) {
  const found = await prisma.chatbotFunctionCommand.findFirst({ where: { userId, id } });
  if (!found) throw new ServiceError('NOT_FOUND', '존재하지 않는 명령어입니다.');
  return found;
}

/**
 * echo/function 두 테이블을 통틀어 같은 이름의 명령어가 없는지 확인한다.
 * exclude: 수정 중인 자기 자신은 제외
 */
export async function assertCommandNameAvailable(
  prisma: PrismaClient,
  userId: number,
  command: string,
  exclude?: { type: CommandType; id: number },
) {
  const [echo, func] = await Promise.all([
    findEchoCommandByName(prisma, userId, command),
    findFunctionCommandByName(prisma, userId, command),
  ]);

  const echoConflict = echo && !(exclude?.type === 'echo' && exclude.id === echo.id);
  const funcConflict = func && !(exclude?.type === 'function' && exclude.id === func.id);

  if (echoConflict || funcConflict) {
    throw new ServiceError('CONFLICT', '이미 존재하는 명령어입니다.');
  }
}

/* ---------- echo ---------- */

export async function createEchoCommand(
  prisma: PrismaClient,
  input: { userId: number; command: string; response: string },
) {
  const command = normalizeCommandName(input.command);
  if (!command || !input.response) {
    throw new ServiceError('INVALID_INPUT', '명령어와 응답을 입력해주세요.');
  }

  await assertCommandNameAvailable(prisma, input.userId, command);

  return prisma.chatbotEchoCommand.create({
    data: { userId: input.userId, command, response: input.response },
  });
}

export async function updateEchoCommand(
  prisma: PrismaClient,
  input: { userId: number; id: number; command?: string; response: string },
) {
  const { userId, id, response } = input;
  if (!response) throw new ServiceError('INVALID_INPUT', '응답을 입력해주세요.');

  const existing = await getEchoCommand(prisma, userId, id);

  const command =
    input.command !== undefined ? normalizeCommandName(input.command) : existing.command;
  if (!command) throw new ServiceError('INVALID_INPUT', '명령어를 입력해주세요.');

  if (command !== existing.command) {
    await assertCommandNameAvailable(prisma, userId, command, { type: 'echo', id });
  }

  return prisma.chatbotEchoCommand.update({
    where: { id: existing.id },
    data: { command, response },
  });
}

/** 삭제된 row 수를 반환한다 (0이면 없었음) */
export async function deleteEchoCommand(prisma: PrismaClient, userId: number, id: number) {
  const result = await prisma.chatbotEchoCommand.deleteMany({ where: { userId, id } });
  return result.count;
}

/* ---------- function ---------- */

export interface FunctionCommandInput {
  userId: number;
  command: string;
  permission: ChatbotPermission;
  function: string;
  option?: string | null;
}

export async function createFunctionCommand(prisma: PrismaClient, input: FunctionCommandInput) {
  const command = normalizeCommandName(input.command);
  if (!command || !input.permission || !input.function) {
    throw new ServiceError('INVALID_INPUT', '명령어, 권한, 기능을 입력해주세요.');
  }

  await assertCommandNameAvailable(prisma, input.userId, command);

  return prisma.chatbotFunctionCommand.create({
    data: {
      userId: input.userId,
      command,
      permission: input.permission,
      function: input.function,
      option: input.option ?? undefined,
    },
  });
}

export async function updateFunctionCommand(
  prisma: PrismaClient,
  input: FunctionCommandInput & { id: number },
) {
  const { userId, id } = input;
  const command = normalizeCommandName(input.command);
  if (!command || !input.permission || !input.function) {
    throw new ServiceError('INVALID_INPUT', '명령어, 권한, 기능을 입력해주세요.');
  }

  const existing = await getFunctionCommand(prisma, userId, id);

  if (command !== existing.command) {
    await assertCommandNameAvailable(prisma, userId, command, { type: 'function', id });
  }

  return prisma.chatbotFunctionCommand.update({
    where: { id: existing.id },
    data: {
      command,
      permission: input.permission,
      function: input.function,
      option: input.option ?? undefined,
    },
  });
}

/** 삭제된 row 수를 반환한다 (0이면 없었음) */
export async function deleteFunctionCommand(prisma: PrismaClient, userId: number, id: number) {
  const result = await prisma.chatbotFunctionCommand.deleteMany({ where: { userId, id } });
  return result.count;
}

export function deleteCommand(prisma: PrismaClient, userId: number, id: number, type: CommandType) {
  return type === 'echo'
    ? deleteEchoCommand(prisma, userId, id)
    : deleteFunctionCommand(prisma, userId, id);
}
