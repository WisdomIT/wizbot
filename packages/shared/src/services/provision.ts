import type { Prisma, PrismaClient } from '@prisma/client';
import type { ChzzkTokenSet } from 'chzzk-open-sdk';

import { getChzzkClientForUser } from './chzzkClient';
import { ServiceError } from './errors';
import { importPlaylist } from './songFavorite';
import { extractPlaylistId, searchVideo } from './youtube';

export type StreamerIdentity = {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
};

export type InitialCommands = (userId: number) => {
  initialFunction: Prisma.ChatbotFunctionCommandCreateManyInput[];
  initialEcho: Prisma.ChatbotEchoCommandCreateManyInput[];
};

/**
 * 스트리머 계정 프로비저닝 — 로그인 인터락과 신청 승인(#151)이 공유한다.
 * User·UserSetting 을 보장하고, 토큰이 있으면 OAuthCredential 에 넣고, 명령어가 하나도 없으면
 * 기본 명령어를 만든다. 멱등이다 — 이미 있는 것은 건드리지 않는다.
 *
 * 기본 명령어 생성기는 인자로 받는다. chatbot 모듈이 services 를 임포트하므로 여기서 chatbot 을
 * 임포트하면 순환이 된다.
 */
export async function provisionStreamer(
  prisma: PrismaClient,
  identity: StreamerIdentity,
  options: { tokens?: ChzzkTokenSet | null; initialCommands: InitialCommands },
) {
  const user = await prisma.user.upsert({
    where: { channelId: identity.channelId },
    update: { channelName: identity.channelName, channelImageUrl: identity.channelImageUrl },
    create: identity,
  });

  const setting = await prisma.userSetting.findFirst({ where: { userId: user.id } });
  if (!setting) await prisma.userSetting.create({ data: { userId: user.id } });

  if (options.tokens) {
    await getChzzkClientForUser(prisma, user.id).auth.setTokens(options.tokens);
  }

  const hasCommand = await prisma.chatbotFunctionCommand.findFirst({ where: { userId: user.id } });
  if (!hasCommand) {
    const { initialFunction, initialEcho } = options.initialCommands(user.id);
    await prisma.chatbotFunctionCommand.createMany({ data: initialFunction });
    await prisma.chatbotEchoCommand.createMany({ data: initialEcho });
  }

  const hasFavorite = await prisma.songFavorite.findFirst({ where: { userId: user.id } });
  if (!hasFavorite) {
    // 유튜브 문제로 프로비저닝(로그인·승인)이 실패해선 안 된다 — 최악은 빈 대표 즐겨찾기로 남는다
    try {
      await createDefaultFavorite(prisma, user.id);
    } catch {
      /* 스트리머가 직접 채울 수 있다 */
    }
  }

  return user;
}

/* ── 기본 즐겨찾기 (#246) ── */

/** 새 스트리머에게 만들어주는 대표 즐겨찾기의 유튜브 재생목록 (어드민 설정) */
export const DEFAULT_PLAYLIST_KEY = 'defaultPlaylistUrl';
export const DEFAULT_FAVORITE_NAME = '위즈 추천 플레이리스트';

export async function getDefaultPlaylistUrl(prisma: PrismaClient) {
  const row = await prisma.siteSetting.findUnique({ where: { key: DEFAULT_PLAYLIST_KEY } });
  return { url: row?.value ?? '' };
}

export async function setDefaultPlaylistUrl(prisma: PrismaClient, rawUrl: string) {
  const url = rawUrl.trim();
  if (url === '') {
    await prisma.siteSetting.deleteMany({ where: { key: DEFAULT_PLAYLIST_KEY } });
    return { url: '' };
  }
  if (!extractPlaylistId(url)) {
    throw new ServiceError('INVALID_INPUT', '유튜브 재생목록 주소가 아닙니다.');
  }
  await prisma.siteSetting.upsert({
    where: { key: DEFAULT_PLAYLIST_KEY },
    update: { value: url },
    create: { key: DEFAULT_PLAYLIST_KEY, value: url },
  });
  return { url };
}

/**
 * 대표 즐겨찾기 「위즈 추천 플레이리스트」 생성 — 자동 재생이 기본 켬(#246)이라
 * 첫 방송부터 출처가 있어야 한다. 어드민이 정한 재생목록을 가져오고,
 * 없거나 실패하면 노래 인기순 첫 곡 하나로 폴백한다.
 */
async function createDefaultFavorite(prisma: PrismaClient, userId: number) {
  const favorite = await prisma.songFavorite.create({
    data: { userId, name: DEFAULT_FAVORITE_NAME, isDefault: true },
  });

  try {
    const { url } = await getDefaultPlaylistUrl(prisma);
    if (url) {
      const { added } = await importPlaylist(prisma, userId, favorite.id, url);
      if (added > 0) return;
    }
  } catch {
    /* 폴백으로 */
  }

  const video = await searchVideo('노래', { sortBy: 'popularity' });
  if (video) {
    await prisma.songFavoriteItem.create({
      data: {
        favoriteId: favorite.id,
        youtubeId: video.youtubeId,
        title: video.title,
        videoUploader: video.uploader,
        durationSeconds: video.durationSeconds,
        order: 0,
      },
    });
  }
}
