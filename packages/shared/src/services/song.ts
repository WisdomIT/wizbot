import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';
import { publishSongEvent } from './songEvents';
import { resolveSong, type YoutubeVideo } from './youtube';

/** 노래 대기열 (#5 #6 1단계) */

export interface SongRequester {
  /** 판별 기준 — 닉네임은 변경 가능하므로 채널 ID 로 식별한다 */
  channelId: string | null;
  /** 표시용 닉네임 (신청 시점 스냅샷) */
  nickname: string;
}

async function getSettings(prisma: PrismaClient, userId: number) {
  const setting = await prisma.userSetting.findUnique({ where: { userId } });
  if (!setting) throw new ServiceError('NOT_FOUND', '사용자 설정이 존재하지 않습니다.');
  return setting;
}

export function listQueue(prisma: PrismaClient, userId: number) {
  return prisma.song.findMany({ where: { userId }, orderBy: { order: 'asc' } });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 곡 신청 — 검색/조회 → 재생 가능 검사 → 정책 검사 → 큐 추가 → 이력 기록.
 * 정책 위반은 ServiceError 로 던져 채팅 응답 메시지가 된다.
 */
export async function requestSong(
  prisma: PrismaClient,
  userId: number,
  input: string,
  requester: SongRequester,
  /** 스트리머가 콘솔에서 직접 추가할 때는 시청자용 정책(기능 on/off·1인1곡·길이·상한)을 적용하지 않는다 */
  options: { bypassPolicy?: boolean } = {},
) {
  const setting = await getSettings(prisma, userId);
  if (!setting.songActive && !options.bypassPolicy) {
    throw new ServiceError('FORBIDDEN', '노래 신청 기능이 꺼져 있습니다.');
  }

  const queue = await listQueue(prisma, userId);

  if (!options.bypassPolicy && queue.length >= setting.songMaxQueueLength) {
    throw new ServiceError(
      'CONFLICT',
      `대기열이 가득 찼습니다. (최대 ${setting.songMaxQueueLength}곡)`,
    );
  }

  //  1인당 신청 곡 수 (#237) — null 은 무제한. 닉네임은 바뀌므로 채널 ID 로 판별한다
  if (!options.bypassPolicy && setting.songMaxPerRequester !== null && requester.channelId) {
    const mine = queue.filter((song) => song.requesterChannelId === requester.channelId);
    if (mine.length >= setting.songMaxPerRequester) {
      throw new ServiceError(
        'CONFLICT',
        setting.songMaxPerRequester === 1
          ? `이미 신청한 곡이 있습니다: ${mine[0].title}`
          : `1인당 ${setting.songMaxPerRequester}곡까지 신청할 수 있습니다.`,
      );
    }
  }

  const video: YoutubeVideo = await resolveSong(input);

  if (!options.bypassPolicy && video.durationSeconds > setting.songMaxDurationSeconds) {
    throw new ServiceError(
      'INVALID_INPUT',
      `${formatDuration(setting.songMaxDurationSeconds)} 이하의 영상만 신청할 수 있습니다. (${formatDuration(video.durationSeconds)})`,
    );
  }

  if (queue.some((song) => song.youtubeId === video.youtubeId)) {
    throw new ServiceError('CONFLICT', '이미 대기열에 있는 곡입니다.');
  }

  const song = await prisma.song.create({
    data: {
      userId,
      youtubeId: video.youtubeId,
      title: video.title,
      videoUploader: video.uploader,
      durationSeconds: video.durationSeconds,
      thumbnailUrl: video.thumbnailUrl,
      requester: requester.nickname.slice(0, 40),
      requesterChannelId: requester.channelId,
      order: (queue.at(-1)?.order ?? 0) + 1,
    },
  });

  publishSongEvent(userId, { type: 'queue' });
  return { song, position: queue.length + 1 };
}

/**
 * 곡 삭제 (#6 A안).
 * - 인수 없음: 본인이 신청한 마지막 곡 취소
 * - 순번 지정: 매니저 이상만, 대기열의 해당 순번(1부터) 곡 삭제
 */
export async function removeSong(
  prisma: PrismaClient,
  userId: number,
  options: {
    position?: number;
    requester: SongRequester;
    /** 순번 지정 삭제 권한 여부 */
    canRemoveOthers: boolean;
  },
) {
  const queue = await listQueue(prisma, userId);
  if (queue.length === 0) {
    throw new ServiceError('NOT_FOUND', '대기열이 비어 있습니다.');
  }

  let target;
  if (options.position !== undefined) {
    if (!options.canRemoveOthers) {
      throw new ServiceError('FORBIDDEN', '순번을 지정한 삭제는 매니저만 가능합니다.');
    }
    target = queue[options.position - 1];
    if (!target) {
      throw new ServiceError('NOT_FOUND', `대기열에 ${options.position}번 곡이 없습니다.`);
    }
  } else {
    const { channelId, nickname } = options.requester;
    const mine = channelId
      ? queue.filter((song) => song.requesterChannelId === channelId)
      : queue.filter((song) => song.requester === nickname);
    target = mine.at(-1);
    if (!target) {
      throw new ServiceError('NOT_FOUND', '신청한 곡이 없습니다.');
    }
  }

  await prisma.$transaction([
    prisma.song.delete({ where: { id: target.id } }),
    prisma.songHistory.create({
      data: {
        userId,
        youtubeId: target.youtubeId,
        title: target.title,
        videoUploader: target.videoUploader,
        requester: target.requester,
        requesterChannelId: target.requesterChannelId,
        durationSeconds: target.durationSeconds,
        status: 'CANCELED',
        resolvedBy: options.requester.nickname.slice(0, 40),
        requestedAt: target.createdAt,
        resolvedAt: new Date(),
      },
    }),
  ]);

  publishSongEvent(userId, { type: 'queue' });
  return target;
}

/* ── 콘솔 큐 편집 (#5 2-b) ── */

async function getOwnedSong(prisma: PrismaClient, userId: number, id: number) {
  const song = await prisma.song.findFirst({ where: { id, userId } });
  if (!song) throw new ServiceError('NOT_FOUND', '대기열에 없는 곡입니다.');
  return song;
}

/** 순서 이동 — 인접 항목과 교체 (링크 설정과 같은 방식) */
export async function moveSong(
  prisma: PrismaClient,
  userId: number,
  id: number,
  direction: 'up' | 'down',
) {
  const current = await getOwnedSong(prisma, userId, id);

  const neighbor = await prisma.song.findFirst({
    where:
      direction === 'up'
        ? { userId, order: { lt: current.order } }
        : { userId, order: { gt: current.order } },
    orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
  });
  if (!neighbor) return { moved: false as const };

  await prisma.$transaction([
    prisma.song.update({ where: { id: current.id }, data: { order: neighbor.order } }),
    prisma.song.update({ where: { id: neighbor.id }, data: { order: current.order } }),
  ]);

  publishSongEvent(userId, { type: 'queue' });
  return { moved: true as const };
}

/** 대기열 전체 비우기 — 개별 삭제와 같이 이력에 CANCELED 로 남긴다 */
export async function clearQueue(prisma: PrismaClient, userId: number, resolvedBy: string) {
  const queue = await listQueue(prisma, userId);
  if (queue.length === 0) return { removed: 0 };

  const resolvedAt = new Date();

  await prisma.$transaction([
    prisma.song.deleteMany({ where: { userId } }),
    prisma.songHistory.createMany({
      data: queue.map((song) => ({
        userId,
        youtubeId: song.youtubeId,
        title: song.title,
        videoUploader: song.videoUploader,
        requester: song.requester,
        requesterChannelId: song.requesterChannelId,
        durationSeconds: song.durationSeconds,
        status: 'CANCELED' as const,
        resolvedBy: resolvedBy.slice(0, 40),
        requestedAt: song.createdAt,
        resolvedAt,
      })),
    }),
  ]);

  publishSongEvent(userId, { type: 'queue' });
  return { removed: queue.length };
}

/**
 * 드래그로 큐 전체 순서를 다시 매긴다 (#5 2-b).
 * 클라이언트가 보는 목록과 서버 상태가 어긋난 채 저장되면 엉뚱한 곡이 밀리므로,
 * 넘어온 id 집합이 현재 큐와 정확히 일치할 때만 반영한다.
 */
export async function reorderQueue(prisma: PrismaClient, userId: number, orderedIds: number[]) {
  const songs = await listQueue(prisma, userId);
  const currentIds = new Set(songs.map((song) => song.id));

  const sameSet =
    orderedIds.length === songs.length &&
    new Set(orderedIds).size === orderedIds.length &&
    orderedIds.every((id) => currentIds.has(id));
  if (!sameSet) {
    throw new ServiceError('CONFLICT', '대기열이 변경되었습니다. 새로고침 후 다시 시도해주세요.');
  }

  // 기존에 쓰던 order 값을 그대로 재사용해 새 순서에 배분한다
  const slots = songs.map((song) => song.order).sort((a, b) => a - b);
  const updates = orderedIds
    .map((id, index) => ({ id, order: slots[index]! }))
    .filter(({ id, order }) => songs.find((song) => song.id === id)!.order !== order);

  if (updates.length === 0) return { reordered: false as const };

  await prisma.$transaction(
    updates.map(({ id, order }) => prisma.song.update({ where: { id }, data: { order } })),
  );

  publishSongEvent(userId, { type: 'queue' });
  return { reordered: true as const };
}

/** 콘솔에서 특정 곡 삭제 — 이력에 CANCELED 로 남긴다 */
export async function removeSongById(
  prisma: PrismaClient,
  userId: number,
  id: number,
  resolvedBy: string,
) {
  const target = await getOwnedSong(prisma, userId, id);

  await prisma.$transaction([
    prisma.song.delete({ where: { id: target.id } }),
    prisma.songHistory.create({
      data: {
        userId,
        youtubeId: target.youtubeId,
        title: target.title,
        videoUploader: target.videoUploader,
        requester: target.requester,
        requesterChannelId: target.requesterChannelId,
        durationSeconds: target.durationSeconds,
        status: 'CANCELED',
        resolvedBy: resolvedBy.slice(0, 40),
        requestedAt: target.createdAt,
        resolvedAt: new Date(),
      },
    }),
  ]);

  publishSongEvent(userId, { type: 'queue' });
  return target;
}
