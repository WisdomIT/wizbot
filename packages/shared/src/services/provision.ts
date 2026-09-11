import type { Prisma, PrismaClient } from '@prisma/client';
import type { ChzzkTokenSet } from 'chzzk-open-sdk';

import { getChzzkAppClient, getChzzkClientForUser } from './chzzkClient';
import { ServiceError } from './errors';
import { notifyAdmins } from './notify';
import { importPlaylist } from './songFavorite';
import { extractPlaylistId, searchVideo } from './youtube';

export type StreamerIdentity = {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
  /** 치지직 팔로워 수 (#271). 모르면(조회 실패) undefined — 기존 값을 유지하고 공개 판정은 공개 쪽으로 */
  followerCount?: number | null;
};

/** 어떤 경로로 등록됐는지 — 알림에 적는다 (#271) */
export type JoinedVia = 'AUTO_APPROVE' | 'MANUAL_APPROVE' | 'WHITELIST';
const JOINED_VIA_LABEL: Record<JoinedVia, string> = {
  AUTO_APPROVE: '자동 승인',
  MANUAL_APPROVE: '수동 승인',
  WHITELIST: '화이트리스트 (어드민 등록 후 첫 로그인)',
};

/* ── 기본 공개 기준 (#271) ── */

/** SiteSetting 키. 값은 정수 문자열 */
export const PUBLIC_FOLLOWER_THRESHOLD_KEY = 'signup.publicFollowerThreshold';
export const DEFAULT_PUBLIC_FOLLOWER_THRESHOLD = 100;

/** 새 스트리머를 목록에 공개할 팔로워 기준. 미만이면 hidden 으로 만들어진다. 0 이면 전부 공개 */
export function parsePublicFollowerThreshold(value: string | undefined): number {
  const threshold = Number(value);
  return Number.isInteger(threshold) && threshold >= 0 ? threshold : DEFAULT_PUBLIC_FOLLOWER_THRESHOLD;
}

export async function getPublicFollowerThreshold(prisma: PrismaClient): Promise<number> {
  const row = await prisma.siteSetting.findUnique({ where: { key: PUBLIC_FOLLOWER_THRESHOLD_KEY } });
  return parsePublicFollowerThreshold(row?.value);
}

/** 치지직에서 팔로워 수만 — 승인 경로처럼 손에 채널 정보가 없을 때. 실패하면 undefined (등록을 막지 않는다) */
export async function fetchFollowerCount(channelId: string): Promise<number | undefined> {
  try {
    const channels = await getChzzkAppClient().channels.get([channelId]);
    return channels[0]?.followerCount;
  } catch {
    return undefined;
  }
}

export type InitialCommands = (userId: number) => {
  initialFunction: Prisma.ChatbotFunctionCommandCreateManyInput[];
  initialEcho: Prisma.ChatbotEchoCommandCreateManyInput[];
};

/**
 * 스트리머 계정 프로비저닝 — 로그인 인터락과 신청 승인(#151)이 공유한다.
 * User·UserSetting 을 보장하고, 토큰이 있으면 OAuthCredential 에 넣고, 명령어가 하나도 없으면
 * 기본 명령어를 만든다. 멱등이다 — 이미 있는 것은 건드리지 않는다.
 *
 * 새 User 가 만들어지는 순간이 곧 「등록」이다 (#271) — 자동 승인·수동 승인·화이트리스트 어느 경로든
 * 여기를 지나므로 신규 등록 알림과 팔로워 기준 기본 공개 판정을 이 한 곳에서 한다.
 *
 * 기본 명령어 생성기는 인자로 받는다. chatbot 모듈이 services 를 임포트하므로 여기서 chatbot 을
 * 임포트하면 순환이 된다.
 */
export async function provisionStreamer(
  prisma: PrismaClient,
  identity: StreamerIdentity,
  options: { tokens?: ChzzkTokenSet | null; initialCommands: InitialCommands; joinedVia: JoinedVia },
) {
  const { followerCount, ...profile } = identity;
  //  팔로워 수는 알 때만 덮는다 — 조회 실패로 기존 값을 null 로 지우지 않는다
  const followerPatch = followerCount === undefined ? {} : { followerCount };

  const existing = await prisma.user.findUnique({ where: { channelId: identity.channelId } });
  let user;
  if (existing) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: { channelName: profile.channelName, channelImageUrl: profile.channelImageUrl, ...followerPatch },
    });
  } else {
    //  팔로워 수가 기준 미만이면 목록에서 숨긴 채로 시작한다 — 시청자가 로그인만 해도 랜딩에 뜨는 것을 막는다.
    //  모르면 공개 (기준이 0 이면 전부 공개)
    const threshold = await getPublicFollowerThreshold(prisma);
    const hidden = followerCount != null && followerCount < threshold;
    user = await prisma.user.create({ data: { ...profile, ...followerPatch, hidden } });
    void notifyStreamerJoined(prisma, user, options.joinedVia);
  }

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

/**
 * 신규 등록 알림 (#271) — 자동 승인이 켜져 있어 신청 절차가 사실상 꺼진 상태여도 운영자가 알 수 있게.
 * 종류는 신청 접수와 같은 SIGNUP — 웹훅을 따로 두지 않고 「사용 신청」 채널 하나로 받는다.
 * 알림은 최선 노력이다 — 실패해도 등록은 이미 끝났다.
 */
function notifyStreamerJoined(
  prisma: PrismaClient,
  user: { id: number; channelId: string; channelName: string; channelImageUrl: string | null; followerCount: number | null; hidden: boolean },
  via: JoinedVia,
) {
  const site = process.env.PUBLIC_SITE_URL ?? '';
  const followers = user.followerCount === null ? '(알 수 없음)' : user.followerCount.toLocaleString('ko-KR');
  const visibility = user.hidden ? '숨김 (팔로워 기준 미만)' : '공개';
  return notifyAdmins(prisma, 'SIGNUP', {
    title: `신규 스트리머 등록: ${user.channelName}`,
    lines: [
      `${user.channelName} 채널이 위즈봇에 등록됐습니다.`,
      `채널 ID: ${user.channelId}`,
      `팔로워: ${followers}`,
      `경로: ${JOINED_VIA_LABEL[via]}`,
      `목록 공개: ${visibility}`,
    ],
    link: { label: '스트리머 관리', url: `${site}/admin/streamers` },
    fields: [
      { name: '채널명', value: user.channelName },
      { name: '채널 ID', value: user.channelId },
      { name: '팔로워', value: followers },
      { name: '경로', value: JOINED_VIA_LABEL[via] },
      { name: '목록 공개', value: visibility },
    ],
    thumbnail: user.channelImageUrl,
  });
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
