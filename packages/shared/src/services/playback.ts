import { randomBytes } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';
import { getSourceSession, isConnected, listSourceSessions, publishSongEvent, SOURCE_TIMEOUT_MS, touchSource } from './songEvents';
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
      ...PLAY_REQUESTED,
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
        ...PLAY_REQUESTED,
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
    data: { status: 'PLAYING', ...RESET_FAILS, ...PLAY_REQUESTED },
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
      data: { status: 'PLAYING', positionSeconds: 0, startedAt: new Date(), ...PLAY_REQUESTED },
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
/** PLAYING 이 될 때마다 — 송출 세션의 응답(sourceAckAt)을 새로 기다린다 (#322). 함수라야 시각이 그때그때 찍힌다 */
const PLAY_REQUESTED = {
  get playRequestedAt() { return new Date(); },
  sourceAckAt: null,
};

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
        ...PLAY_REQUESTED,
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

  // 진행률은 자주 오므로 이벤트를 쏘지 않는다 (컨트롤러는 자체 타이머로 보간). 진행률이 온다 = 송출 세션이 재생 중이다 → 응답으로 친다 (#322)
  return prisma.songPlayback.update({
    where: { userId },
    data: { positionSeconds: Math.max(0, Math.floor(positionSeconds)), sourceAckAt: new Date() },
  });
}

/**
 * 송출 세션이 「이 곡을 실제로 재생 시작했다」(YouTube onStateChange PLAYING) (#322).
 * 컨트롤러는 playRequestedAt 뒤 이 응답이 없으면 「송출 소스가 재생에 응답하지 않습니다」를 띄운다. 지난 곡의 보고는 버린다
 */
export async function reportPlaying(prisma: PrismaClient, userId: number, youtubeId: string) {
  const playback = await prisma.songPlayback.findUnique({ where: { userId } });
  if (!playback || playback.youtubeId !== youtubeId) return playback;
  if (playback.sourceAckAt && playback.playRequestedAt && playback.sourceAckAt >= playback.playRequestedAt) return playback;
  const updated = await prisma.songPlayback.update({ where: { userId }, data: { sourceAckAt: new Date() } });
  //  경고를 바로 지울 수 있게 — 곡마다 1회뿐이라 부담이 없다
  publishSongEvent(userId, { type: 'playback' });
  return updated;
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

/* ── 송출 세션 (#322) ── */

export type SourceSessionInput = { sessionId: string; source: 'OBS' | 'ELECTRON'; label?: string | null };

const DEFAULT_LABEL: Record<string, string> = { OBS: 'OBS 브라우저 소스', ELECTRON: '위즈봇 플레이어 앱' };

/**
 * 하트비트 — 세션을 목록에 올리고, 이 세션이 소리를 낼 차례인지 돌려준다.
 * 소리를 내는 세션은 스트리머가 고른 것(songSourceSessionId) 하나. 아직 아무것도 고르지 않았으면 **처음 붙은 세션을 자동으로 고른다** —
 * 앱을 설치하고 켜기만 하면 소리가 나야 하고, 예전 사용자(타입만 골라둔 상태)도 같은 타입의 창이 붙으면 그대로 이어진다.
 */
export async function touchSourceSession(prisma: PrismaClient, userId: number, input: SourceSessionInput) {
  const label = (input.label?.trim() || DEFAULT_LABEL[input.source] || input.source).slice(0, 80);
  const { changed } = touchSource(userId, { sessionId: input.sessionId, source: input.source, label });

  const setting = await prisma.userSetting.findUnique({
    where: { userId },
    select: { id: true, songSourceSessionId: true, songSourceType: true },
  });
  let adopted = false;
  if (setting && !setting.songSourceSessionId && (setting.songSourceType === 'NONE' || setting.songSourceType === input.source)) {
    await prisma.userSetting.update({
      where: { id: setting.id },
      data: { songSourceSessionId: input.sessionId, songSourceType: input.source, songSourceLabel: label },
    });
    adopted = true;
  }
  if (changed || adopted) publishSongEvent(userId, { type: 'source' });

  const activeId = adopted ? input.sessionId : setting?.songSourceSessionId ?? null;
  return { active: activeId === input.sessionId, adopted };
}

/** 스트리머가 이 세션을 송출 소스로 고른다 — 목록에 있는(끊긴 지 1시간 안) 세션이면 된다. 꺼진 앱을 미리 골라두면 켜질 때 바로 소리가 난다 */
export async function selectSource(prisma: PrismaClient, userId: number, sessionId: string) {
  const session = getSourceSession(userId, sessionId);
  if (!session) throw new ServiceError('NOT_FOUND', '그 플레이어가 목록에 없습니다. 켜서 다시 연결해주세요.');
  const setting = await prisma.userSetting.findUnique({ where: { userId }, select: { id: true } });
  if (!setting) throw new ServiceError('NOT_FOUND', '사용자 설정이 존재하지 않습니다.');
  await prisma.userSetting.update({
    where: { id: setting.id },
    data: { songSourceSessionId: sessionId, songSourceType: session.source as 'OBS' | 'ELECTRON', songSourceLabel: session.label },
  });
  //  이전 주인은 멈추고 새 주인은 재생을 시작해야 한다 — 소스들은 이 이벤트로 다시 맞춘다
  publishSongEvent(userId, { type: 'source' });
  return { sessionId, source: session.source, label: session.label };
}

/** 선택 해제 — 어느 창도 소리를 내지 않는다 (예전 「사용 안 함」) */
export async function clearSourceSelection(prisma: PrismaClient, userId: number) {
  const setting = await prisma.userSetting.findUnique({ where: { userId }, select: { id: true } });
  if (!setting) throw new ServiceError('NOT_FOUND', '사용자 설정이 존재하지 않습니다.');
  await prisma.userSetting.update({ where: { id: setting.id }, data: { songSourceSessionId: null, songSourceType: 'NONE', songSourceLabel: null } });
  publishSongEvent(userId, { type: 'source' });
  return { ok: true as const };
}

/** 「찾기」 — 그 창이 스스로를 드러낸다(빨간 테두리·띵동·작업 표시줄 깜빡임) */
export function locateSource(userId: number, sessionId: string) {
  const session = getSourceSession(userId, sessionId, { connectedOnly: true });
  if (!session) throw new ServiceError('NOT_FOUND', '그 플레이어가 지금 연결돼 있지 않아 신호를 받을 수 없습니다.');
  publishSongEvent(userId, { type: 'locate', sessionId });
  return { ok: true as const };
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

/** 컨트롤러에 보여줄 송출 상태 — 선택된 세션·연결 여부·붙어 있는 세션 전부 (#322) */
export async function getSourceStatus(prisma: PrismaClient, userId: number, now = Date.now()) {
  const setting = await ensureSourceTokens(prisma, userId);
  const sessions = listSourceSessions(userId, now);
  const selected = setting.songSourceSessionId ? sessions.find((s) => s.sessionId === setting.songSourceSessionId) ?? null : null;

  return {
    /** 스트리머가 고른 세션 — null 이면 아직 선택 전 */
    selectedSessionId: setting.songSourceSessionId,
    sourceType: setting.songSourceType,
    sourceLabel: setting.songSourceLabel,
    /** 고른 세션이 지금 붙어 있는가 (목록엔 1시간 남아 있어도 15초 안에 신호가 없으면 끊김) */
    online: selected !== null && isConnected(selected, now),
    /**
     * 「몇 ms 전에 봤는지」 (#319) — 컨트롤러가 자기 시계로 lastSeenAt 을 빼면 PC 시계 오차만큼 틀려서
     * 「연결됨 ↔ 연결 안 됨」이 깜빡였다. 응답을 받은 시각에 이 값을 더해 세면 시계가 달라도 맞다
     */
    lastSeenAgoMs: selected ? now - selected.lastSeenAt : null,
    /** 보존 중인 세션 전부(끊긴 것도 1시간) — 컨트롤러가 목록으로 보여주고 하나를 고른다 (#322) */
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      source: s.source as 'OBS' | 'ELECTRON',
      label: s.label,
      active: s.sessionId === setting.songSourceSessionId,
      connected: isConnected(s, now),
      lastSeenAgoMs: now - s.lastSeenAt,
    })),
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
