import { randomBytes } from 'node:crypto';

import type { PrismaClient, SongSourceType } from '@prisma/client';

import { ServiceError } from './errors';
import {
  getSourcePresence,
  isActiveSession,
  listSourceSessions,
  publishSongEvent,
  releaseSource,
  SOURCE_TIMEOUT_MS,
  touchSource,
} from './songEvents';
import * as songFavoriteService from './songFavorite';

/** 재생 제어·송출 소스 중재 (#5 2단계) */

export async function getPlayback(prisma: PrismaClient, userId: number) {
  const playback = await prisma.songPlayback.findUnique({ where: { userId } });
  if (playback) return playback;

  // 아직 재생한 적 없는 스트리머 — 기본 상태를 만들어 둔다
  return prisma.songPlayback.create({ data: { userId, status: 'STOPPED' } });
}

/** 큐의 첫 곡을 현재 곡으로 올린다. 큐가 비면 정지 상태로 */
/**
 * 대기열이 비었을 때 대표 즐겨찾기에서 한 곡을 이어 재생한다 (#5 3단계).
 * 설정이 꺼져 있거나 담긴 곡이 없으면 null 을 돌려주고 평소대로 정지한다.
 */
async function pickAutoPlaySong(prisma: PrismaClient, userId: number) {
  const setting = await prisma.userSetting.findUnique({ where: { userId } });
  if (!setting?.songAutoPlayFromDefault) return null;

  const current = await prisma.songPlayback.findUnique({ where: { userId } });
  const item = await songFavoriteService.pickAutoPlayItem(prisma, userId, current?.youtubeId);
  if (!item) return null;

  const playback = await prisma.songPlayback.update({
    where: { userId },
    data: {
      status: 'PLAYING',
      youtubeId: item.youtubeId,
      title: item.title,
      videoUploader: item.videoUploader,
      requester: songFavoriteService.AUTO_PLAY_REQUESTER,
      durationSeconds: item.durationSeconds,
      positionSeconds: 0,
      startedAt: new Date(),
    },
  });

  publishSongEvent(userId, { type: 'playback' });
  return playback;
}

export async function advanceToNext(prisma: PrismaClient, userId: number) {
  const next = await prisma.song.findFirst({ where: { userId }, orderBy: { order: 'asc' } });

  if (!next) {
    // 대기열이 비었으면 설정에 따라 대표 즐겨찾기에서 한 곡 골라 잇는다 (#5 3단계)
    const auto = await pickAutoPlaySong(prisma, userId);
    if (auto) return auto;

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
  failReason?: string,
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
      failReason,
      requestedAt: playback.startedAt ?? new Date(),
      resolvedAt: new Date(),
    },
  });
}

export async function play(prisma: PrismaClient, userId: number) {
  const playback = await getPlayback(prisma, userId);

  // 올려둔 곡이 없으면 큐에서 하나 꺼낸다. 연속 실패로 멈췄던 상태(차단기)는 사람이 ▶ 를 누른 것으로 풀린다 (#319)
  if (!playback.youtubeId) {
    if (playback.failStreak > 0) await prisma.songPlayback.update({ where: { userId }, data: RESET_FAILS });
    return advanceToNext(prisma, userId);
  }

  const updated = await prisma.songPlayback.update({
    where: { userId },
    data: { status: 'PLAYING', ...RESET_FAILS },
  });
  publishSongEvent(userId, { type: 'playback' });
  publishSongEvent(userId, { type: 'command', action: 'play' });
  return updated;
}

/**
 * 재생 ↔ 일시정지 뒤집기 (#85).
 *
 * 단축키는 메인 프로세스에서 오는데, 거기서는 폴링으로 받은 스냅샷만 들고 있어
 * 방향을 스스로 정하면 최대 10초까지 틀린다(누른 직후 다시 누르면 같은 방향을 또 보냄).
 * 서버가 지금 상태를 보고 뒤집는다.
 */
export async function togglePlay(prisma: PrismaClient, userId: number) {
  const playback = await getPlayback(prisma, userId);
  return playback.status === 'PLAYING' ? pause(prisma, userId) : play(prisma, userId);
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
      ...RESET_FAILS,
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
  //  사람이 넘긴 것 — 연속 실패 카운트는 처음부터 (#319)
  await prisma.songPlayback.update({ where: { userId }, data: RESET_FAILS });
  const playback = await advanceToNext(prisma, userId);
  publishSongEvent(userId, { type: 'command', action: 'next' });
  return playback;
}

/**
 * 전역 단축키 (#85) — Electron accelerator 형식.
 * 데스크톱 앱이 창을 열지 않고도 조작할 수 있게 등록한다.
 */
export const DEFAULT_SONG_SHORTCUTS = {
  playPause: 'CommandOrControl+Shift+P',
  stop: 'CommandOrControl+Shift+S',
  next: 'CommandOrControl+Shift+N',
} as const;

export type SongShortcuts = { playPause: string; stop: string; next: string };

/**
 * 최소한의 형식 검사.
 * 수식키 하나 이상 + 일반 키 하나. 이걸 통과해도 OS/다른 앱이 선점했으면
 * 등록에 실패할 수 있는데, 그건 앱이 조용히 넘긴다.
 */
const ACCELERATOR = /^(?:(?:CommandOrControl|Command|Control|Alt|Option|Shift|Super)\+){1,3}[A-Za-z0-9]{1,3}$/;

export async function setShortcuts(
  prisma: PrismaClient,
  userId: number,
  shortcuts: SongShortcuts,
) {
  for (const value of Object.values(shortcuts)) {
    if (!ACCELERATOR.test(value)) {
      throw new ServiceError('INVALID_INPUT', `단축키 형식이 올바르지 않습니다: ${value}`);
    }
  }

  const used = new Set(Object.values(shortcuts));
  if (used.size !== 3) {
    throw new ServiceError('CONFLICT', '단축키가 서로 겹칩니다.');
  }

  await prisma.userSetting.update({
    where: { userId },
    data: {
      songShortcutPlayPause: shortcuts.playPause,
      songShortcutStop: shortcuts.stop,
      songShortcutNext: shortcuts.next,
    },
  });

  return { ok: true as const };
}

/** 한 곡 반복 — 곡이 끝나도 다음으로 넘기지 않고 처음부터 다시 재생한다 */
export async function setRepeatOne(prisma: PrismaClient, userId: number, enabled: boolean) {
  await getPlayback(prisma, userId);
  const updated = await prisma.songPlayback.update({
    where: { userId },
    data: { repeatOne: enabled },
  });
  publishSongEvent(userId, { type: 'playback' });
  return updated;
}

/**
 * 곡이 끝까지 재생됨 — 소스가 보고한다.
 * 한 곡 반복 중이면 이력을 남기지 않고 처음부터 다시 재생한다
 * (반복할 때마다 이력이 쌓이면 기록이 같은 곡으로 뒤덮인다).
 */
export async function reportEnded(prisma: PrismaClient, userId: number) {
  const playback = await getPlayback(prisma, userId);

  if (playback.repeatOne && playback.youtubeId) {
    const looped = await prisma.songPlayback.update({
      where: { userId },
      data: { status: 'PLAYING', positionSeconds: 0, startedAt: new Date() },
    });
    publishSongEvent(userId, { type: 'playback' });
    publishSongEvent(userId, { type: 'command', action: 'play' });
    return looped;
  }

  await recordHistory(prisma, userId, 'PLAYED');
  //  끝까지 재생됐다 — 환경 문제가 아니었으니 연속 실패 카운트를 푼다 (#319)
  if (playback.failStreak > 0) await prisma.songPlayback.update({ where: { userId }, data: RESET_FAILS });
  return advanceToNext(prisma, userId);
}

/* ── 재생 실패 (#319) ── */

/** 연속 실패가 이만큼이면 다음 곡으로 넘기지 않고 멈춘다 — 곡이 아니라 환경(임베드 차단·네트워크·로그인) 문제일 가능성이 크다 */
export const FAIL_STREAK_LIMIT = 3;
const RESET_FAILS = { failStreak: 0, lastFailReason: null };

/**
 * YouTube IFrame API onError 코드 → 사람이 읽는 원인.
 * https://developers.google.com/youtube/iframe_api_reference#onError
 */
export function describeFailCode(code: number | null | undefined): string {
  switch (code) {
    case 2: return '잘못된 영상 ID';
    case 5: return '플레이어 오류(HTML5)';
    case 100: return '삭제·비공개 영상';
    case 101:
    case 150: return '임베드 차단';
    default: return code == null ? '원인 미상' : `알 수 없는 오류(${code})`;
  }
}

const FAIL_SOURCE_LABEL: Record<string, string> = { OBS: 'OBS', ELECTRON: '앱' };

/** 이력·배너에 남기는 문구: 「임베드 차단 · 앱」 */
export function formatFailReason(code: number | null | undefined, source: string | null | undefined): string {
  const where = source ? FAIL_SOURCE_LABEL[source] ?? source : null;
  return where ? `${describeFailCode(code)} · ${where}` : describeFailCode(code);
}

/**
 * 재생 실패 — 임베드 차단 등. 이력에 FAILED(원인 포함)로 남기고 다음 곡으로.
 * 연속 FAIL_STREAK_LIMIT 회면 넘기지 않고 STOPPED 로 멈춘다(차단기) — 자동 재생이 켜져 있으면 실패→다음 곡→실패가 끝없이 이어져
 * 정지조차 못 하던 문제. 사람이 ▶·다음 곡을 누르면 카운트가 풀린다. 이미 넘어간 곡의 늦은 보고(youtubeId 불일치)는 버린다
 */
export async function reportFailed(
  prisma: PrismaClient,
  userId: number,
  detail: { code?: number | null; source?: string | null; youtubeId?: string | null } = {},
) {
  const playback = await getPlayback(prisma, userId);
  if (detail.youtubeId && playback.youtubeId && playback.youtubeId !== detail.youtubeId) return { playback, halted: false };

  const reason = formatFailReason(detail.code, detail.source);
  await recordHistory(prisma, userId, 'FAILED', undefined, reason);
  const streak = playback.failStreak + 1;

  if (streak >= FAIL_STREAK_LIMIT) {
    const halted = await prisma.songPlayback.update({
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
        failStreak: streak,
        lastFailReason: reason,
      },
    });
    publishSongEvent(userId, { type: 'playback' });
    publishSongEvent(userId, { type: 'command', action: 'stop' });
    return { playback: halted, halted: true };
  }

  await prisma.songPlayback.update({ where: { userId }, data: { failStreak: streak, lastFailReason: reason } });
  return { playback: await advanceToNext(prisma, userId), halted: false };
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
        ...RESET_FAILS,
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

/**
 * 송출 소스가 5초마다 보고하는 재생 위치.
 *
 * **어느 곡의 위치인지 확인하고 받는다.** 곡이 바뀌는 순간과 보고 주기가 겹치면
 * 소스의 플레이어가 아직 이전 영상의 끝(예: 210초)을 들고 있는데, 그걸 그대로 저장하면
 * 방금 0 으로 리셋한 값을 덮어써 다음 곡이 이전 곡 시간을 이어받는다 (#122).
 */
export async function reportPosition(
  prisma: PrismaClient,
  userId: number,
  positionSeconds: number,
  youtubeId: string,
) {
  const playback = await prisma.songPlayback.findUnique({ where: { userId } });
  // 이미 다음 곡으로 넘어갔다면 지난 곡의 보고다 — 버린다
  if (!playback || playback.youtubeId !== youtubeId) return playback;

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

/** 하트비트 갱신 — 창을 여러 개 열면 먼저 잡은 것이 활성, 나머지는 대기 */
export function touchSourceSession(userId: number, source: string, sessionId: string) {
  const { changed } = touchSource(userId, source, sessionId);
  // 주인·세션 수가 바뀔 때만 알린다 — 끊기는 쪽은 구독자가 lastSeenAt 으로 직접 판정한다
  if (changed) publishSongEvent(userId, { type: 'source' });
}

/** 「다른 창으로 넘기기」 (#319) — 대기 중인 다른 창이 있어야 넘어간다 */
export function handoffSource(userId: number) {
  const moved = releaseSource(userId);
  if (!moved) throw new ServiceError('CONFLICT', '넘길 다른 창이 없습니다. 대기 중인 플레이어가 있어야 합니다.');
  publishSongEvent(userId, { type: 'source' });
  return { ok: true as const };
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
export async function getSourceStatus(prisma: PrismaClient, userId: number, now = Date.now()) {
  const setting = await ensureSourceTokens(prisma, userId);
  const presence = getSourcePresence(userId, now);
  const sessions = listSourceSessions(userId, now);

  return {
    sourceType: setting.songSourceType,
    online: presence !== null && presence.source === setting.songSourceType,
    connectedSource: presence?.source ?? null,
    lastSeenAt: presence ? new Date(presence.lastSeenAt) : null,
    /**
     * 「몇 ms 전에 봤는지」 (#319) — 컨트롤러가 자기 시계로 lastSeenAt 을 빼면 PC 시계 오차만큼 틀려서
     * 「연결됨 ↔ 연결 안 됨」이 깜빡였다. 응답을 받은 시각에 이 값을 더해 세면 시계가 달라도 맞다
     */
    lastSeenAgoMs: presence ? now - presence.lastSeenAt : null,
    /** 붙어 있는 창 전부 — 활성 1 + 대기 N (#319). 지정된 소스 타입의 창만 하트비트가 등록된다 */
    sessions: sessions.map((s) => ({ source: s.source, active: s.active, lastSeenAgoMs: now - s.lastSeenAt })),
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
