import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';
import { publishSongEvent } from './songEvents';
import { getPlaylistVideos, resolveSong, type YoutubeVideo } from './youtube';

/**
 * 즐겨찾기 = 스트리머가 미리 담아두는 재생목록 (#5 3단계).
 *
 * - 대표(isDefault) 즐겨찾기는 유저당 최대 1개이고, 자동 재생의 출처가 된다
 * - 곡 추가는 검색어·영상 주소 하나씩, 또는 유튜브 재생목록 통째로
 */

const MAX_FAVORITES = 20;
const MAX_ITEMS = 500;
/** 자동 재생 신청자 표시 — 시청자 신청과 구분된다 */
export const AUTO_PLAY_REQUESTER = '자동 재생';

async function getOwned(prisma: PrismaClient, userId: number, favoriteId: number) {
  const favorite = await prisma.songFavorite.findFirst({ where: { id: favoriteId, userId } });
  if (!favorite) throw new ServiceError('NOT_FOUND', '없는 즐겨찾기입니다.');
  return favorite;
}

export function listFavorites(prisma: PrismaClient, userId: number) {
  return prisma.songFavorite.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    include: { _count: { select: { items: true } } },
  });
}

export async function getFavorite(prisma: PrismaClient, userId: number, favoriteId: number) {
  const favorite = await getOwned(prisma, userId, favoriteId);
  const items = await prisma.songFavoriteItem.findMany({
    where: { favoriteId },
    orderBy: { order: 'asc' },
  });
  return { ...favorite, items };
}

export async function createFavorite(prisma: PrismaClient, userId: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError('INVALID_INPUT', '이름을 입력해주세요.');

  const count = await prisma.songFavorite.count({ where: { userId } });
  if (count >= MAX_FAVORITES) {
    throw new ServiceError('CONFLICT', `즐겨찾기는 최대 ${MAX_FAVORITES}개까지 만들 수 있습니다.`);
  }

  return prisma.songFavorite.create({
    data: {
      userId,
      name: trimmed.slice(0, 50),
      // 첫 즐겨찾기는 자동으로 대표가 된다
      isDefault: count === 0,
    },
  });
}

export async function renameFavorite(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
  name: string,
) {
  await getOwned(prisma, userId, favoriteId);
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError('INVALID_INPUT', '이름을 입력해주세요.');

  return prisma.songFavorite.update({
    where: { id: favoriteId },
    data: { name: trimmed.slice(0, 50) },
  });
}

export async function deleteFavorite(prisma: PrismaClient, userId: number, favoriteId: number) {
  const favorite = await getOwned(prisma, userId, favoriteId);
  await prisma.songFavorite.delete({ where: { id: favoriteId } });

  // 대표를 지웠으면 남은 것 중 가장 오래된 것을 대표로 올린다 (자동 재생이 조용히 멈추지 않게)
  if (favorite.isDefault) {
    const fallback = await prisma.songFavorite.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (fallback) {
      await prisma.songFavorite.update({ where: { id: fallback.id }, data: { isDefault: true } });
    }
  }

  return { deleted: true as const };
}

export async function setDefaultFavorite(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
) {
  await getOwned(prisma, userId, favoriteId);

  await prisma.$transaction([
    prisma.songFavorite.updateMany({ where: { userId }, data: { isDefault: false } }),
    prisma.songFavorite.update({ where: { id: favoriteId }, data: { isDefault: true } }),
  ]);

  return { ok: true as const };
}

/* ── 곡 ── */

async function nextOrder(prisma: PrismaClient, favoriteId: number) {
  const last = await prisma.songFavoriteItem.findFirst({
    where: { favoriteId },
    orderBy: { order: 'desc' },
  });
  return (last?.order ?? 0) + 1;
}

export async function addFavoriteItem(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
  input: string,
) {
  await getOwned(prisma, userId, favoriteId);

  const count = await prisma.songFavoriteItem.count({ where: { favoriteId } });
  if (count >= MAX_ITEMS) {
    throw new ServiceError('CONFLICT', `한 즐겨찾기에는 최대 ${MAX_ITEMS}곡까지 담을 수 있습니다.`);
  }

  const video: YoutubeVideo = await resolveSong(input);

  const existing = await prisma.songFavoriteItem.findFirst({
    where: { favoriteId, youtubeId: video.youtubeId },
  });
  if (existing) throw new ServiceError('CONFLICT', '이미 담겨 있는 곡입니다.');

  return prisma.songFavoriteItem.create({
    data: {
      favoriteId,
      youtubeId: video.youtubeId,
      title: video.title,
      videoUploader: video.uploader,
      durationSeconds: video.durationSeconds,
      order: await nextOrder(prisma, favoriteId),
    },
  });
}

/** 담기 전에 무엇이 담기는지 확인시키기 위한 조회 — 저장하지 않는다 (#97) */
export async function previewItem(input: string) {
  return resolveSong(input);
}

/** 재생목록 미리보기 — 전체 목록은 무거우므로 앞부분만 돌려준다 */
export async function previewPlaylist(url: string, sample = 5) {
  const { title, videos, truncated } = await getPlaylistVideos(url);
  return {
    title,
    total: videos.length,
    truncated,
    videos: videos.slice(0, sample),
  };
}

/**
 * 유튜브 재생목록 통째로 가져오기.
 * 곡마다 재생 가능 여부는 확인하지 않는다 — 수백 번 요청해야 하고,
 * 재생 실패는 송출 소스가 FAILED 로 보고해 자동으로 넘어가기 때문이다.
 */
export async function importPlaylist(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
  url: string,
) {
  await getOwned(prisma, userId, favoriteId);

  const { title, videos, truncated } = await getPlaylistVideos(url);

  const existing = await prisma.songFavoriteItem.findMany({
    where: { favoriteId },
    select: { youtubeId: true },
  });
  const known = new Set(existing.map((item) => item.youtubeId));

  const room = MAX_ITEMS - existing.length;
  if (room <= 0) {
    throw new ServiceError('CONFLICT', `한 즐겨찾기에는 최대 ${MAX_ITEMS}곡까지 담을 수 있습니다.`);
  }

  const fresh = videos.filter((video) => !known.has(video.youtubeId)).slice(0, room);
  if (fresh.length === 0) {
    return { playlistTitle: title, added: 0, skipped: videos.length, truncated };
  }

  const start = await nextOrder(prisma, favoriteId);
  await prisma.songFavoriteItem.createMany({
    data: fresh.map((video, index) => ({
      favoriteId,
      youtubeId: video.youtubeId,
      title: video.title,
      videoUploader: video.uploader,
      durationSeconds: video.durationSeconds,
      order: start + index,
    })),
  });

  return {
    playlistTitle: title,
    added: fresh.length,
    skipped: videos.length - fresh.length,
    truncated: truncated || videos.length - fresh.length > 0,
  };
}

export async function removeFavoriteItem(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
  itemId: number,
) {
  await getOwned(prisma, userId, favoriteId);

  const item = await prisma.songFavoriteItem.findFirst({ where: { id: itemId, favoriteId } });
  if (!item) throw new ServiceError('NOT_FOUND', '없는 곡입니다.');

  await prisma.songFavoriteItem.delete({ where: { id: itemId } });
  return { deleted: true as const };
}

export async function clearFavoriteItems(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
) {
  await getOwned(prisma, userId, favoriteId);
  const { count } = await prisma.songFavoriteItem.deleteMany({ where: { favoriteId } });
  return { removed: count };
}

/** 대기열과 같은 방식 — 넘어온 id 집합이 현재 목록과 정확히 일치할 때만 반영한다 */
export async function reorderFavoriteItems(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
  orderedIds: number[],
) {
  await getOwned(prisma, userId, favoriteId);

  const items = await prisma.songFavoriteItem.findMany({
    where: { favoriteId },
    orderBy: { order: 'asc' },
  });
  const currentIds = new Set(items.map((item) => item.id));

  const sameSet =
    orderedIds.length === items.length &&
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every((id) => currentIds.has(id));
  if (!sameSet) {
    throw new ServiceError('CONFLICT', '목록이 변경되었습니다. 새로고침 후 다시 시도해주세요.');
  }

  const slots = items.map((item) => item.order).sort((a, b) => a - b);
  const updates = orderedIds
    .map((id, index) => ({ id, order: slots[index]! }))
    .filter(({ id, order }) => items.find((item) => item.id === id)!.order !== order);

  if (updates.length === 0) return { reordered: false as const };

  await prisma.$transaction(
    updates.map(({ id, order }) =>
      prisma.songFavoriteItem.update({ where: { id }, data: { order } }),
    ),
  );
  return { reordered: true as const };
}

/* ── 대기열로 ── */

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * 즐겨찾기를 대기열 뒤에 붙인다.
 * 스트리머가 직접 하는 조작이므로 신청 정책(길이·1인1곡·상한)은 적용하지 않되,
 * 이미 대기열에 있는 곡은 건너뛴다.
 */
export async function enqueueFavorite(
  prisma: PrismaClient,
  userId: number,
  favoriteId: number,
  options: { shuffle?: boolean; requester: string },
) {
  await getOwned(prisma, userId, favoriteId);

  const items = await prisma.songFavoriteItem.findMany({
    where: { favoriteId },
    orderBy: { order: 'asc' },
  });
  if (items.length === 0) throw new ServiceError('NOT_FOUND', '즐겨찾기에 담긴 곡이 없습니다.');

  const queue = await prisma.song.findMany({ where: { userId }, orderBy: { order: 'asc' } });
  const known = new Set(queue.map((song) => song.youtubeId));

  const picked = (options.shuffle ? shuffled(items) : items).filter(
    (item) => !known.has(item.youtubeId),
  );
  if (picked.length === 0) {
    throw new ServiceError('CONFLICT', '이미 모두 대기열에 있습니다.');
  }

  const start = (queue.at(-1)?.order ?? 0) + 1;
  await prisma.song.createMany({
    data: picked.map((item, index) => ({
      userId,
      youtubeId: item.youtubeId,
      title: item.title,
      videoUploader: item.videoUploader,
      durationSeconds: item.durationSeconds,
      thumbnailUrl: null,
      requester: options.requester.slice(0, 40),
      requesterChannelId: null,
      order: start + index,
    })),
  });

  publishSongEvent(userId, { type: 'queue' });
  return { added: picked.length, skipped: items.length - picked.length };
}

/**
 * 자동 재생용 한 곡 — 대표 즐겨찾기에서 무작위로 고른다.
 * 방금 나온 곡이 또 걸리지 않도록 현재 재생 중인 곡은 제외한다.
 */
export async function pickAutoPlayItem(
  prisma: PrismaClient,
  userId: number,
  excludeYoutubeId?: string | null,
) {
  const favorite = await prisma.songFavorite.findFirst({ where: { userId, isDefault: true } });
  if (!favorite) return null;

  const items = await prisma.songFavoriteItem.findMany({ where: { favoriteId: favorite.id } });
  if (items.length === 0) return null;

  const candidates =
    items.length > 1 && excludeYoutubeId
      ? items.filter((item) => item.youtubeId !== excludeYoutubeId)
      : items;

  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}
