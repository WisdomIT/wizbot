import { randomBytes } from 'node:crypto';

import type { PrismaClient, SongSourceType } from '@prisma/client';

import { ServiceError } from './errors';
import {
  getSourcePresence,
  isActiveSession,
  publishSongEvent,
  SOURCE_TIMEOUT_MS,
  touchSource,
} from './songEvents';

/** 재생 제어·송출 소스 중재 (#5 2단계) */

export async function getPlayback(prisma: PrismaClient, userId: number) {
  const playback = await prisma.songPlayback.findUnique({ where: { userId } });
  if (playback) return playback;

  // 아직 재생한 적 없는 스트리머 — 기본 상태를 만들어 둔다
  return prisma.songPlayback.create({ data: { userId, status: 'STOPPED' } });
}

/** 큐의 첫 곡을 현재 곡으로 올린다. 큐가 비면 정지 상태로 */
export async function advanceToNext(prisma: PrismaClient, userId: number) {
  const next = await prisma.song.findFirst({ where: { userId }, orderBy: { order: 'asc' } });

  if (!next) {
    const stopped = await prisma.songPlayback.update({
      where: { userId },
      data: {
        status: 'STOPPED',
        youtubeId: null,
        title: null,
        videoUploader: null,
        requester: null,
        durationSeconds: 0,
        positionSeconds: 0,
        startedAt: null,
      },
    });
    publishSongEvent(userId, { type: 'playback' });
    return stopped;
  }

  const [playback] = await prisma.$transaction([
    prisma.songPlayback.update({
      where: { userId },
      data: {
        status: 'PLAYING',
        youtubeId: next.youtubeId,
        title: next.title,
        videoUploader: next.videoUploader,
        requester: next.requester,
        durationSeconds: next.durationSeconds,
        positionSeconds: 0,
        startedAt: new Date(),
      },
    }),
    prisma.song.delete({ where: { id: next.id } }),
  ]);

  publishSongEvent(userId, { type: 'playback' });
  publishSongEvent(userId, { type: 'queue' });
  return playback;
}

/**
 * 현재 곡을 이력에 남긴다.
 * @param status PLAYED(끝까지) · SKIPPED(중단) · FAILED(재생 실패)
 */
async function recordHistory(
  prisma: PrismaClient,
  userId: number,
  status: 'PLAYED' | 'SKIPPED' | 'FAILED',
  resolvedBy?: string,
) {
  const playback = await prisma.songPlayback.findUnique({ where: { userId } });
  if (!playback?.youtubeId || !playback.title) return;

  await prisma.songHistory.create({
    data: {
      userId,
      youtubeId: playback.youtubeId,
      title: playback.title,
      videoUploader: playback.videoUploader ?? '',
      requester: playback.requester ?? '',
      durationSeconds: playback.durationSeconds,
      status,
      resolvedBy,
      requestedAt: playback.startedAt ?? new Date(),
      resolvedAt: new Date(),
    },
  });
}

export async function play(prisma: PrismaClient, userId: number) {
  const playback = await getPlayback(prisma, userId);

  // 올려둔 곡이 없으면 큐에서 하나 꺼낸다
  if (!playback.youtubeId) return advanceToNext(prisma, userId);

  const updated = await prisma.songPlayback.update({
    where: { userId },
    data: { status: 'PLAYING' },
  });
  publishSongEvent(userId, { type: 'playback' });
  publishSongEvent(userId, { type: 'command', action: 'play' });
  return updated;
}

export async function pause(prisma: PrismaClient, userId: number) {
  await getPlayback(prisma, userId);
  const updated = await prisma.songPlayback.update({
    where: { userId },
    data: { status: 'PAUSED' },
  });
  publishSongEvent(userId, { type: 'playback' });
  publishSongEvent(userId, { type: 'command', action: 'pause' });
  return updated;
}

/** 정지 — 현재 곡을 SKIPPED 로 남기고 비운다 */
export async function stop(prisma: PrismaClient, userId: number, resolvedBy?: string) {
  await getPlayback(prisma, userId);
  await recordHistory(prisma, userId, 'SKIPPED', resolvedBy);

  const updated = await prisma.songPlayback.update({
    where: { userId },
    data: {
      status: 'STOPPED',
      youtubeId: null,
      title: null,
      videoUploader: null,
      requester: null,
      durationSeconds: 0,
      positionSeconds: 0,
      startedAt: null,
    },
  });
  publishSongEvent(userId, { type: 'playback' });
  publishSongEvent(userId, { type: 'command', action: 'stop' });
  return updated;
}

/** 다음 곡 — 현재 곡은 중단(SKIPPED)으로 기록 */
export async function skipToNext(prisma: PrismaClient, userId: number, resolvedBy?: string) {
  await getPlayback(prisma, userId);
  await recordHistory(prisma, userId, 'SKIPPED', resolvedBy);
  const playback = await advanceToNext(prisma, userId);
  publishSongEvent(userId, { type: 'command', action: 'next' });
  return playback;
}

/** 곡이 끝까지 재생됨 — 소스가 보고한다 */
export async function reportEnded(prisma: PrismaClient, userId: number) {
  await recordHistory(prisma, userId, 'PLAYED');
  return advanceToNext(prisma, userId);
}

/** 재생 실패 — 임베드 차단 등. 이력에 FAILED 로 남기고 다음 곡으로 */
export async function reportFailed(prisma: PrismaClient, userId: number) {
  await recordHistory(prisma, userId, 'FAILED');
  return advanceToNext(prisma, userId);
}

/** 대기열의 특정 곡을 지금 재생한다 — 현재 곡은 SKIPPED 로 기록 (#5 2-b) */
export async function playSongNow(
  prisma: PrismaClient,
  userId: number,
  songId: number,
  resolvedBy?: string,
) {
  const target = await prisma.song.findFirst({ where: { id: songId, userId } });
  if (!target) throw new ServiceError('NOT_FOUND', '대기열에 없는 곡입니다.');

  await getPlayback(prisma, userId);
  await recordHistory(prisma, userId, 'SKIPPED', resolvedBy);

  const [playback] = await prisma.$transaction([
    prisma.songPlayback.update({
      where: { userId },
      data: {
        status: 'PLAYING',
        youtubeId: target.youtubeId,
        title: target.title,
        videoUploader: target.videoUploader,
        requester: target.requester,
        durationSeconds: target.durationSeconds,
        positionSeconds: 0,
        startedAt: new Date(),
      },
    }),
    prisma.song.delete({ where: { id: target.id } }),
  ]);

  publishSongEvent(userId, { type: 'playback' });
  publishSongEvent(userId, { type: 'queue' });
  return playback;
}

/** 재생 위치 이동 — 소스에 seek 명령을 보내고 상태도 맞춘다 */
export async function seek(prisma: PrismaClient, userId: number, positionSeconds: number) {
  const position = Math.max(0, Math.floor(positionSeconds));
  const updated = await prisma.songPlayback.update({
    where: { userId },
    data: { positionSeconds: position },
  });
  publishSongEvent(userId, { type: 'command', action: 'seek', value: position });
  publishSongEvent(userId, { type: 'playback' });
  return updated;
}

export async function reportPosition(
  prisma: PrismaClient,
  userId: number,
  positionSeconds: number,
) {
  // 진행률은 자주 오므로 이벤트를 쏘지 않는다 (컨트롤러는 자체 타이머로 보간)
  return prisma.songPlayback.update({
    where: { userId },
    data: { positionSeconds: Math.max(0, Math.floor(positionSeconds)) },
  });
}

export async function setVolume(prisma: PrismaClient, userId: number, volume: number) {
  const clamped = Math.min(100, Math.max(0, Math.floor(volume)));
  const updated = await prisma.songPlayback.update({
    where: { userId },
    data: { volume: clamped },
  });
  publishSongEvent(userId, { type: 'playback' });
  publishSongEvent(userId, { type: 'command', action: 'volume', value: clamped });
  return updated;
}

/* ── 송출 소스 ── */

/** 하트비트 갱신 — 창을 여러 개 열면 마지막 것이 활성 세션이 된다 */
export function touchSourceSession(userId: number, source: string, sessionId: string) {
  touchSource(userId, source, sessionId);
  publishSongEvent(userId, { type: 'source' });
}

export function isSessionActive(userId: number, sessionId: string) {
  return isActiveSession(userId, sessionId);
}

function newToken() {
  return randomBytes(24).toString('hex');
}

/** OBS 페이지 토큰을 보장한다 (없으면 생성) */
export async function ensureSourceTokens(prisma: PrismaClient, userId: number) {
  const setting = await prisma.userSetting.findUnique({ where: { userId } });
  if (!setting) throw new ServiceError('NOT_FOUND', '사용자 설정이 존재하지 않습니다.');

  if (setting.songSourceToken && setting.songOverlayToken) return setting;

  return prisma.userSetting.update({
    where: { id: setting.id },
    data: {
      songSourceToken: setting.songSourceToken ?? newToken(),
      songOverlayToken: setting.songOverlayToken ?? newToken(),
    },
  });
}

/** 토큰 재발급 — 방송 화면에 URL 이 노출됐을 때 사용 */
export async function regenerateSourceToken(
  prisma: PrismaClient,
  userId: number,
  kind: 'source' | 'overlay',
) {
  const setting = await ensureSourceTokens(prisma, userId);
  return prisma.userSetting.update({
    where: { id: setting.id },
    data: kind === 'source' ? { songSourceToken: newToken() } : { songOverlayToken: newToken() },
  });
}

export async function setSourceType(
  prisma: PrismaClient,
  userId: number,
  sourceType: SongSourceType,
) {
  const setting = await prisma.userSetting.findUnique({ where: { userId } });
  if (!setting) throw new ServiceError('NOT_FOUND', '사용자 설정이 존재하지 않습니다.');

  const updated = await prisma.userSetting.update({
    where: { id: setting.id },
    data: { songSourceType: sourceType },
  });
  publishSongEvent(userId, { type: 'source' });
  return updated;
}

/** 컨트롤러에 보여줄 소스 상태 — 지정된 소스가 오프라인이면 경고할 수 있게 */
export async function getSourceStatus(prisma: PrismaClient, userId: number) {
  const setting = await ensureSourceTokens(prisma, userId);
  const presence = getSourcePresence(userId);

  return {
    sourceType: setting.songSourceType,
    online: presence !== null && presence.source === setting.songSourceType,
    connectedSource: presence?.source ?? null,
    lastSeenAt: presence ? new Date(presence.lastSeenAt) : null,
    timeoutMs: SOURCE_TIMEOUT_MS,
    sourceToken: setting.songSourceToken,
    overlayToken: setting.songOverlayToken,
    overlay: {
      mode: setting.songOverlayMode,
      durationSeconds: setting.songOverlayDurationSeconds,
    },
  };
}

/** 자막 표시 방식 — 계속 띄울지(ALWAYS), 곡이 바뀔 때 잠깐만 보여줄지(TIMED) */
export async function setOverlaySettings(
  prisma: PrismaClient,
  userId: number,
  input: { mode: 'ALWAYS' | 'TIMED'; durationSeconds: number },
) {
  await prisma.userSetting.update({
    where: { userId },
    data: {
      songOverlayMode: input.mode,
      songOverlayDurationSeconds: input.durationSeconds,
    },
  });

  // 송출 소스가 즉시 반영하도록 알린다
  publishSongEvent(userId, { type: 'source' });
  return { ok: true as const };
}
