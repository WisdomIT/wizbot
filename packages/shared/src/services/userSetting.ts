import type { Prisma, PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

export async function getUserSetting(prisma: PrismaClient, userId: number) {
  const found = await prisma.userSetting.findFirst({ where: { userId } });
  if (!found) throw new ServiceError('NOT_FOUND', '사용자 설정이 존재하지 않습니다.');
  return found;
}

export async function updateUserSetting(
  prisma: PrismaClient,
  userId: number,
  data: Prisma.UserSettingUpdateInput,
) {
  const existing = await getUserSetting(prisma, userId);
  return prisma.userSetting.update({ where: { id: existing.id }, data });
}
