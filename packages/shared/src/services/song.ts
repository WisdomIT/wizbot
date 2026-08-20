import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';
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
) {
  const setting = await getSettings(prisma, userId);
  if (!setting.songActive) {
    throw new ServiceError('FORBIDDEN', '현재 노래 신청을 받지 않습니다.');
  }

  const queue = await listQueue(prisma, userId);

  if (queue.length >= setting.songMaxQueueLength) {
    throw new ServiceError(
      'CONFLICT',
      `대기열이 가득 찼습니다. (최대 ${setting.songMaxQueueLength}곡)`,
    );
  }

  if (setting.songOneRequestPerUser && requester.channelId) {
    const mine = queue.find((song) => song.requesterChannelId === requester.channelId);
    if (mine) {
      throw new ServiceError('CONFLICT', `이미 신청한 곡이 있습니다: ${mine.title}`);
    }
  }

  const video: YoutubeVideo = await resolveSong(input);

  if (video.durationSeconds > setting.songMaxDurationSeconds) {
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

  return target;
}
