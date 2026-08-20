import type { PrismaClient } from '@prisma/client';

import { getChzzkAppClient } from './chzzkClient';
import { ServiceError } from './errors';

/** 화이트리스트 = 입장권. 삭제해도 기존 User/데이터는 유지되고 재로그인만 차단된다 (#10 기획) */

export async function listWhitelist(prisma: PrismaClient) {
  const [entries, users] = await Promise.all([
    prisma.whitelist.findMany({ orderBy: { id: 'asc' } }),
    prisma.user.findMany({ select: { channelId: true, channelName: true, channelImageUrl: true } }),
  ]);
  const userByChannelId = new Map(users.map((user) => [user.channelId, user]));

  return entries.map((entry) => ({
    ...entry,
    /** 이 채널로 실제 가입(로그인)한 유저 — 없으면 아직 미가입 */
    user: userByChannelId.get(entry.channelId) ?? null,
  }));
}

export async function addToWhitelist(prisma: PrismaClient, channelIdInput: string) {
  const channelId = channelIdInput.trim();
  if (!/^[0-9a-f]{32}$/.test(channelId)) {
    throw new ServiceError('INVALID_INPUT', '채널 ID 형식이 올바르지 않습니다 (32자리 16진수).');
  }

  const existing = await prisma.whitelist.findUnique({ where: { channelId } });
  if (existing) {
    throw new ServiceError('CONFLICT', '이미 화이트리스트에 등록된 채널입니다.');
  }

  // 치지직에서 채널 존재 확인 + 채널명 자동 조회
  const channels = await getChzzkAppClient().channels.get([channelId]);
  if (channels.length === 0) {
    throw new ServiceError(
      'NOT_FOUND',
      '치지직에서 채널을 찾을 수 없습니다. 채널 ID를 확인해주세요.',
    );
  }
  const { channelName, channelImageUrl } = channels[0];

  const entry = await prisma.whitelist.create({
    data: { channelId, nickname: channelName },
  });

  return { ...entry, channelName, channelImageUrl };
}

export async function removeFromWhitelist(prisma: PrismaClient, id: number) {
  const existing = await prisma.whitelist.findUnique({ where: { id } });
  if (!existing) {
    throw new ServiceError('NOT_FOUND', '존재하지 않는 화이트리스트 항목입니다.');
  }
  await prisma.whitelist.delete({ where: { id } });
  return existing;
}
