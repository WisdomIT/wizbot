import type { PrismaClient, SongHistoryStatus } from '@prisma/client';

import { getFunctionCommandDisplay } from '../chatbot/definitions';
import { ServiceError } from './errors';

/**
 * 재생 기록 (#5 4단계).
 *
 * 큐에서 사라진 곡도 전부 남는다 — 분탕 대응·통계·다시 신청에 쓴다.
 * 시청자 공개는 두 단계로 막는다: 설정(songHistoryPublic) + 항목별 숨김(hiddenFromViewers).
 */

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/** 시청자 페이지에 안내할 노래 명령어 */
const SONG_FUNCTIONS = ['requestSong', 'removeSong', 'listSongs', 'currentSong'] as const;

export interface HistoryPage<T> {
  items: T[];
  /** 다음 페이지 요청에 쓸 마지막 항목 id. null 이면 끝 */
  nextCursor: number | null;
}

function paginate<T extends { id: number }>(rows: T[], limit: number): HistoryPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** 스트리머 콘솔 — 상태 필터와 제목·신청자 검색 */
export async function listHistory(
  prisma: PrismaClient,
  userId: number,
  options: { cursor?: number; status?: SongHistoryStatus; query?: string; limit?: number } = {},
) {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const search = options.query?.trim();

  const rows = await prisma.songHistory.findMany({
    where: {
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(search
        ? { OR: [{ title: { contains: search } }, { requester: { contains: search } }] }
        : {}),
      // 커서는 id 내림차순 — 기록은 추가만 되므로 id 순서가 곧 시간 순서다
      ...(options.cursor ? { id: { lt: options.cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit + 1,
  });

  return paginate(rows, limit);
}

export async function setHistoryHidden(
  prisma: PrismaClient,
  userId: number,
  id: number,
  hidden: boolean,
) {
  const found = await prisma.songHistory.findFirst({ where: { id, userId } });
  if (!found) throw new ServiceError('NOT_FOUND', '없는 기록입니다.');

  return prisma.songHistory.update({
    where: { id },
    data: { hiddenFromViewers: hidden },
  });
}

export async function getHistoryEntry(prisma: PrismaClient, userId: number, id: number) {
  const found = await prisma.songHistory.findFirst({ where: { id, userId } });
  if (!found) throw new ServiceError('NOT_FOUND', '없는 기록입니다.');
  return found;
}

/* ── 시청자 공개 ── */

async function getPublicUser(prisma: PrismaClient, channelId: string) {
  const user = await prisma.user.findUnique({
    where: { channelId },
    select: { id: true, channelName: true },
  });
  if (!user) throw new ServiceError('NOT_FOUND', '존재하지 않는 채널입니다.');
  return user;
}

/**
 * 시청자 플레이리스트 — 현재 곡 + 대기열 + 이 방송의 노래 명령어.
 * 명령어 이름은 스트리머가 바꿀 수 있으므로 저장된 이름을 그대로 보여준다 (#82 비활성은 제외).
 */
export async function getPublicPlaylist(prisma: PrismaClient, channelId: string) {
  const user = await getPublicUser(prisma, channelId);

  const [setting, playback, queue, commands] = await Promise.all([
    prisma.userSetting.findUnique({ where: { userId: user.id } }),
    prisma.songPlayback.findUnique({ where: { userId: user.id } }),
    prisma.song.findMany({ where: { userId: user.id }, orderBy: { order: 'asc' } }),
    prisma.chatbotFunctionCommand.findMany({
      where: { userId: user.id, enabled: true, function: { in: [...SONG_FUNCTIONS] } },
    }),
  ]);

  return {
    channelName: user.channelName,
    songActive: setting?.songActive ?? false,
    historyPublic: setting?.songHistoryPublic ?? false,
    maxPerRequester: setting === null ? null : setting.songMaxPerRequester,
    maxDurationSeconds: setting?.songMaxDurationSeconds ?? 0,
    maxQueueLength: setting?.songMaxQueueLength ?? 0,
    playback:
      playback && playback.youtubeId
        ? {
            status: playback.status,
            youtubeId: playback.youtubeId,
            title: playback.title,
            videoUploader: playback.videoUploader,
            requester: playback.requester,
            durationSeconds: playback.durationSeconds,
            positionSeconds: playback.positionSeconds,
          }
        : null,
    queue: queue.map((song) => ({
      id: song.id,
      title: song.title,
      videoUploader: song.videoUploader,
      requester: song.requester,
      durationSeconds: song.durationSeconds,
    })),
    commands: commands.map((command) => {
      const display = getFunctionCommandDisplay(command.function, command.command);
      return {
        command: command.command,
        usageString: display.usageString,
        description: display.descriptionShort,
      };
    }),
  };
}

/**
 * 시청자 화면 하단 재생 바용 — 현재 곡만 (#97).
 * 모든 시청자 페이지에서 주기적으로 부르므로 대기열·명령어까지 실어 보내지 않는다.
 */
export async function getPublicNowPlaying(prisma: PrismaClient, channelId: string) {
  const user = await getPublicUser(prisma, channelId);
  const playback = await prisma.songPlayback.findUnique({ where: { userId: user.id } });

  if (!playback?.youtubeId || playback.status === 'STOPPED') return { playback: null };

  return {
    playback: {
      status: playback.status,
      youtubeId: playback.youtubeId,
      title: playback.title,
      videoUploader: playback.videoUploader,
      requester: playback.requester,
      durationSeconds: playback.durationSeconds,
      positionSeconds: playback.positionSeconds,
    },
  };
}

/** 시청자 재생 기록 — 설정이 켜져 있고, 개별 숨김되지 않은 항목만 */
export async function getPublicHistory(
  prisma: PrismaClient,
  channelId: string,
  options: { cursor?: number; limit?: number } = {},
) {
  const user = await getPublicUser(prisma, channelId);

  const setting = await prisma.userSetting.findUnique({ where: { userId: user.id } });
  if (!setting?.songHistoryPublic) {
    throw new ServiceError('FORBIDDEN', '이 방송은 재생 기록을 공개하지 않습니다.');
  }

  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const rows = await prisma.songHistory.findMany({
    where: {
      userId: user.id,
      hiddenFromViewers: false,
      ...(options.cursor ? { id: { lt: options.cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      youtubeId: true,
      title: true,
      videoUploader: true,
      requester: true,
      durationSeconds: true,
      status: true,
      requestedAt: true,
    },
  });

  return { channelName: user.channelName, ...paginate(rows, limit) };
}
