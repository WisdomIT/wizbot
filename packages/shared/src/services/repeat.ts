import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

export function listRepeats(prisma: PrismaClient, userId: number) {
  return prisma.chatbotRepeat.findMany({ where: { userId } });
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
