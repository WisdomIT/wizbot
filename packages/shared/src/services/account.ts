import type { PrismaClient } from '@prisma/client';

import { getChzzkAppClient } from './chzzkClient';
import { ServiceError } from './errors';

/** 스트리머 본인 계정 설정 (#7) */

export async function getAccount(prisma: PrismaClient, userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      channelId: true,
      channelName: true,
      channelImageUrl: true,
      hidden: true,
      userSetting: { select: { chatbotActive: true } },
    },
  });
  if (!user) throw new ServiceError('NOT_FOUND', '사용자를 찾을 수 없습니다.');

  return {
    channelId: user.channelId,
    channelName: user.channelName,
    channelImageUrl: user.channelImageUrl,
    /** 메인·스트리머 목록 노출 여부 (직접 링크는 항상 열림) */
    listed: !user.hidden,
    chatbotActive: user.userSetting?.chatbotActive ?? true,
  };
}

/** 치지직에서 채널명·프로필 이미지를 다시 가져와 갱신 (채널명 변경 시 수동 반영 수단) */
export async function refreshChannelInfo(prisma: PrismaClient, userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { channelId: true },
  });
  if (!user) throw new ServiceError('NOT_FOUND', '사용자를 찾을 수 없습니다.');

  const channels = await getChzzkAppClient().channels.get([user.channelId]);
  if (channels.length === 0) {
    throw new ServiceError('NOT_FOUND', '치지직에서 채널 정보를 가져오지 못했습니다.');
  }
  const { channelName, channelImageUrl } = channels[0];

  return prisma.user.update({
    where: { id: userId },
    data: { channelName, channelImageUrl },
    select: { channelName: true, channelImageUrl: true },
  });
}

/** 목록 노출 여부 — 스트리머 본인과 관리자 모두 조작할 수 있다 */
export function setListed(prisma: PrismaClient, userId: number, listed: boolean) {
  return prisma.user.update({ where: { id: userId }, data: { hidden: !listed } });
}

/**
 * 챗봇 사용 여부. 끄면 워커가 다음 폴링(≤60초)에서 채널 연결을 끊고 반복 메시지도 멈춘다
 * (chatbot.getChannels 가 chatbotActive 인 채널만 반환 → 워커의 diff 동기화가 dispose).
 */
export async function setChatbotActive(prisma: PrismaClient, userId: number, active: boolean) {
  const setting = await prisma.userSetting.findUnique({ where: { userId } });
  if (!setting) throw new ServiceError('NOT_FOUND', '사용자 설정이 존재하지 않습니다.');

  return prisma.userSetting.update({
    where: { id: setting.id },
    data: { chatbotActive: active },
  });
}
