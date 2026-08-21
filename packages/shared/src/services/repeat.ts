import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

/**
 * 반복 메시지 목록.
 * @param onlyEnabled 켜진 것만 (워커용). 콘솔은 전부 필요하므로 기본 false (#82)
 */
export function listRepeats(prisma: PrismaClient, userId: number, onlyEnabled = false) {
  return prisma.chatbotRepeat.findMany({
    where: onlyEnabled ? { userId, enabled: true } : { userId },
  });
}

/** 활성/비활성 토글 — 끄면 워커가 다음 동기화에서 타이머를 정리한다 (#82) */
export async function setRepeatEnabled(
  prisma: PrismaClient,
  userId: number,
  id: number,
  enabled: boolean,
) {
  const existing = await getRepeat(prisma, userId, id);
  return prisma.chatbotRepeat.update({ where: { id: existing.id }, data: { enabled } });
}

export async function getRepeat(prisma: PrismaClient, userId: number, id: number) {
  const found = await prisma.chatbotRepeat.findFirst({ where: { userId, id } });
  if (!found) throw new ServiceError('NOT_FOUND', '존재하지 않는 반복 메시지입니다.');
  return found;
}

export function createRepeat(
  prisma: PrismaClient,
  input: { userId: number; response: string; interval: number },
) {
  if (!input.response || !input.interval || input.interval <= 0) {
    throw new ServiceError('INVALID_INPUT', '반복 메시지와 주기(초)를 입력해주세요.');
  }
  return prisma.chatbotRepeat.create({ data: input });
}

export async function updateRepeat(
  prisma: PrismaClient,
  input: { userId: number; id: number; response: string; interval: number },
) {
  if (!input.response || !input.interval || input.interval <= 0) {
    throw new ServiceError('INVALID_INPUT', '반복 메시지와 주기(초)를 입력해주세요.');
  }
  const existing = await getRepeat(prisma, input.userId, input.id);
  return prisma.chatbotRepeat.update({
    where: { id: existing.id },
    data: { response: input.response, interval: input.interval },
  });
}

export async function deleteRepeat(prisma: PrismaClient, userId: number, id: number) {
  const existing = await getRepeat(prisma, userId, id);
  return prisma.chatbotRepeat.delete({ where: { id: existing.id } });
}

export async function deleteAllRepeats(prisma: PrismaClient, userId: number) {
  const result = await prisma.chatbotRepeat.deleteMany({ where: { userId } });
  return result.count;
}
