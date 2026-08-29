import type { CafeAction, CafeLinkStatus, PrismaClient } from '@prisma/client';

import { parseCafeSlug, parseClubInfo } from '../lib/cafe';
import { buildGatePlan, cafeImageUrl, EMPTY_PICKS, findImageTags, findYoutubeTags, type GateBox, type GatePicks, gatePicksSchema, normalizeGateHtml } from '../lib/cafeGate';
import { decideSave, RETRY_MS, type SaveReason, viewerBucket } from '../lib/cafePolicy';
import { parseYoutubeChannelPage, youtubeChannelUrl } from '../lib/youtube';
import {
  type CafeLayout,
  cafeLayoutSchema,
  type CafeScene,
  cafeSnapshotSchema,
  EMPTY_LAYOUT,
  SAMPLE_SNAPSHOT,
} from '../lib/cafeLayout';
import { fetchLiveSnapshot } from '../lib/chzzkLive';
import { ServiceError } from './errors';

/**
 * 네이버 카페 연동 (#9).
 * 봇 계정 하나가 각 스트리머 카페의 매니저가 되어 대문을 갱신한다. 이 서비스는 그 과정의 상태를
 * 관리한다 — 실제 네이버 접속(가입·권한 확인·저장)은 apps/cafe 워커가 puppeteer 로 한다.
 */

export type FetchLike = (url: string) => Promise<{ ok: boolean; arrayBuffer(): Promise<ArrayBuffer> }>;

const DEFAULTS = {
  enabled: false,
  cafeUrl: null,
  clubId: null,
  cafeName: null,
  status: 'NONE' as CafeLinkStatus,
  statusMessage: null,
  pendingAction: null as CafeAction | null,
  requestedAt: null,
  youtubeChannelId: null,
  youtubeTitle: null,
  youtubeUrl: null,
};

export async function getIntegration(prisma: PrismaClient, userId: number) {
  const row = await prisma.cafeIntegration.findUnique({ where: { userId } });
  return row ?? { id: 0, userId, ...DEFAULTS, layout: null, updatedAt: null };
}

export function setEnabled(prisma: PrismaClient, userId: number, enabled: boolean) {
  return prisma.cafeIntegration.upsert({
    where: { userId },
    update: { enabled },
    create: { userId, enabled },
  });
}

/**
 * 카페 주소 → clubid. 카페 첫 페이지를 받아 파싱한다 (EUC-KR).
 * 주소가 바뀌면 연동 상태는 처음부터 — 다른 카페에는 봇이 가입돼 있지 않다.
 */
export async function linkCafe(
  prisma: PrismaClient,
  userId: number,
  input: string,
  fetchImpl: FetchLike = fetch,
) {
  const slug = parseCafeSlug(input);
  if (!slug) throw new ServiceError('INVALID_INPUT', '카페 주소 형식이 올바르지 않습니다. 예: https://cafe.naver.com/카페주소');

  const response = await fetchImpl(`https://cafe.naver.com/${slug}`).catch(() => null);
  if (!response?.ok) throw new ServiceError('NOT_FOUND', '카페 페이지를 열 수 없습니다. 주소를 확인해주세요.');
  const html = decodeHtml(await response.arrayBuffer());
  const info = parseClubInfo(html);
  if (!info) throw new ServiceError('NOT_FOUND', '카페 정보를 찾지 못했습니다. 존재하지 않거나 비공개 카페일 수 있습니다.');

  const existing = await prisma.cafeIntegration.findUnique({ where: { userId } });
  const changed = existing?.clubId !== info.clubId;
  const reset = changed
    ? { status: 'NONE' as CafeLinkStatus, statusMessage: null, pendingAction: null, requestedAt: null }
    : {};
  return prisma.cafeIntegration.upsert({
    where: { userId },
    update: { cafeUrl: `https://cafe.naver.com/${slug}`, clubId: info.clubId, cafeName: info.cafeName, ...reset },
    create: { userId, cafeUrl: `https://cafe.naver.com/${slug}`, clubId: info.clubId, cafeName: info.cafeName },
  });
}

/**
 * 네이버 카페 페이지는 EUC-KR(MS949)이다 — <meta charset> 을 보고 디코딩한다.
 * 선언이 없으면 UTF-8. (실측: `<meta http-equiv="Content-Type" content="text/html;charset=KSC5601">`)
 */
export function decodeHtml(buffer: ArrayBuffer): string {
  const head = new TextDecoder('latin1').decode(buffer.slice(0, 4096));
  const charset = head.match(/charset=["']?\s*([a-z0-9_-]+)/i)?.[1]?.toLowerCase() ?? '';
  const korean = /euc-kr|ms949|ksc5601|cp949/.test(charset);
  return new TextDecoder(korean ? 'euc-kr' : 'utf-8').decode(buffer);
}

async function requireLinked(prisma: PrismaClient, userId: number) {
  const row = await prisma.cafeIntegration.findUnique({ where: { userId } });
  if (!row?.clubId) throw new ServiceError('INVALID_INPUT', '먼저 카페 주소를 연결해주세요.');
  const session = await prisma.naverBotSession.findUnique({ where: { id: 1 } });
  if (!session) throw new ServiceError('FORBIDDEN', '봇 계정이 아직 등록되지 않았습니다. 관리자에게 문의해주세요.');
  return row;
}

/**
 * 봇 가입 신청 — 운영자에게 요청한다. 워커가 하지 않는다: 카페 가입 폼에 보안문자가 있어
 * 프로그램으로는 통과할 수 없다(실측). 운영자가 봇 계정으로 직접 가입 신청하고 「가입 완료」를
 * 누르면 JOINED 가 된다. 알림(메일)은 라우터가 보낸다.
 */
export async function requestJoin(prisma: PrismaClient, userId: number) {
  const row = await requireLinked(prisma, userId);
  if (row.status === 'JOIN_REQUESTED') {
    throw new ServiceError('CONFLICT', '이미 운영자에게 가입을 요청했습니다. 처리되면 상태가 바뀝니다.');
  }
  return prisma.cafeIntegration.update({
    where: { userId },
    data: { status: 'JOIN_REQUESTED', statusMessage: null, requestedAt: new Date() },
  });
}

/** 권한 확인 — 워커에게 일을 시킨다. 처리 결과는 completeAction 으로 돌아온다 (≤ 폴링 주기) */
export async function requestAction(prisma: PrismaClient, userId: number, action: CafeAction) {
  const row = await requireLinked(prisma, userId);
  if (row.pendingAction) throw new ServiceError('CONFLICT', '이미 처리 중인 요청이 있습니다. 잠시 후 다시 시도해주세요.');
  return prisma.cafeIntegration.update({
    where: { userId },
    data: { pendingAction: action, requestedAt: new Date() },
  });
}

/* ── 대문 HTML 가져오기·삽입 (#9 PR3) ── */

function isPermitted(status: CafeLinkStatus): boolean {
  return status === 'PERMISSION_OK' || status === 'ACTIVE';
}

export function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL ?? 'https://bot.wisdomit.co.kr').replace(/\/$/, '');
}

async function requirePermitted(prisma: PrismaClient, userId: number) {
  const row = await requireLinked(prisma, userId);
  if (!isPermitted(row.status)) throw new ServiceError('FORBIDDEN', '먼저 「권한 확인」을 통과해야 합니다.');
  if (row.pendingAction) throw new ServiceError('CONFLICT', '이미 처리 중인 요청이 있습니다. 잠시 후 다시 시도해주세요.');
  return row;
}

/** 대문 HTML 읽어오기 — 워커에게 시킨다 */
export async function requestGateFetch(prisma: PrismaClient, userId: number) {
  await requirePermitted(prisma, userId);
  return prisma.cafeIntegration.update({
    where: { userId },
    data: { pendingAction: 'FETCH_GATE', requestedAt: new Date() },
  });
}

/** 콘솔의 「대문 자리 고르기」에 필요한 것 — 렌더·고른 자리·들어 있는 블록·설정 완료 여부 */
export async function getGate(prisma: PrismaClient, userId: number) {
  const row = await prisma.cafeIntegration.findUnique({ where: { userId }, include: { assets: { select: { scene: true } }, user: { select: { channelId: true } } } });
  if (!row) return null;
  const picks = gatePicksSchema.safeParse(row.gatePicks ?? {});
  const snapshot = cafeSnapshotSchema.safeParse(row.lastSnapshot ?? {});
  return {
    /** 반영 현황 — 마지막 대문 변경·반영된 방송 상태·현재 대문 이미지 */
    activity: {
      gateUpdatedAt: row.gateUpdatedAt,
      lastSavedAt: row.lastSavedAt,
      serial: row.lastSaveSerial,
      gateSerial: row.gateSerial,
      snapshot: snapshot.success && row.lastSavedAt ? snapshot.data : null,
      imageUrl: row.gateSerial > 0 ? cafeImageUrl(siteUrl(), row.user.channelId, row.gateSerial) : null,
    },
    gateHtml: row.gateHtml,
    gateFetchedAt: row.gateFetchedAt,
    /** 워커 렌더 — 콘솔은 이 그림 위에 클릭 영역을 얹는다. 대문이 비어 있으면 null */
    render: row.gateImage && row.gateWidth && row.gateHeight
      ? { png: Buffer.from(row.gateImage).toString('base64'), width: row.gateWidth, height: row.gateHeight, boxes: (row.gateBoxes ?? []) as GateBox[] }
      : null,
    picks: picks.success ? picks.data : EMPTY_PICKS,
    /** 대문에 이미 들어 있는 블록 */
    present: { image: !!row.gateHtml && findImageTags(row.gateHtml).length > 0, youtube: !!row.gateHtml && findYoutubeTags(row.gateHtml).length > 0 },
    /** 자리를 골라도 이게 안 돼 있으면 반영하지 않는다 */
    ready: { image: row.assets.some((a) => a.scene === 'live'), youtube: !!row.youtubeChannelId },
  };
}

/** 스트리머가 고른 자리 저장 → 워커에게 반영 요청. 고른 자리가 없고 뺄 것도 없으면 아무 일도 없다 */
export async function savePicks(prisma: PrismaClient, userId: number, picks: GatePicks) {
  const row = await requirePermitted(prisma, userId);
  if (!row.gateHtml) throw new ServiceError('INVALID_INPUT', '먼저 대문 HTML 을 가져와주세요.');
  await prisma.cafeIntegration.update({ where: { userId }, data: { gatePicks: picks } });
  return { applying: await autoApplyGate(prisma, userId) };
}

/* ── 어드민: 가입 대기 목록 ── */

export function listJoinRequests(prisma: PrismaClient) {
  return prisma.cafeIntegration.findMany({
    where: { status: 'JOIN_REQUESTED' },
    select: {
      id: true,
      clubId: true,
      cafeName: true,
      cafeUrl: true,
      requestedAt: true,
      user: { select: { channelName: true } },
    },
    orderBy: { requestedAt: 'asc' },
  });
}

/** 운영자가 봇 계정으로 가입 신청을 마쳤다 */
export async function markJoined(prisma: PrismaClient, id: number) {
  const row = await prisma.cafeIntegration.findUnique({ where: { id } });
  if (!row) throw new ServiceError('NOT_FOUND', '존재하지 않는 연동입니다.');
  return prisma.cafeIntegration.update({
    where: { id },
    data: { status: 'JOINED', statusMessage: null },
  });
}

export type FetchTextLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; text(): Promise<string> }>;

/**
 * 유튜브 채널 연결 — 주소·@핸들·채널 ID 를 받아 채널 페이지에서 UC ID 를 찾는다. null 이면 해제.
 * 대문에 유튜브 자리가 골라져 있으면 바로 반영을 시킨다.
 */
export async function setYoutube(prisma: PrismaClient, userId: number, input: string | null, fetchImpl: FetchTextLike = fetch) {
  if (input === null || !input.trim()) {
    await prisma.cafeIntegration.upsert({
      where: { userId },
      update: { youtubeChannelId: null, youtubeTitle: null, youtubeUrl: null },
      create: { userId },
    });
    return { channel: null, applying: await autoApplyGate(prisma, userId) };
  }
  const url = youtubeChannelUrl(input);
  if (!url) throw new ServiceError('INVALID_INPUT', '유튜브 채널 주소(youtube.com/@핸들 또는 /channel/…)나 @핸들을 넣어주세요.');
  const response = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36', 'accept-language': 'ko,en' } }).catch(() => null);
  if (!response?.ok) throw new ServiceError('NOT_FOUND', '유튜브 채널 페이지를 열 수 없습니다. 주소를 확인해주세요.');
  const info = parseYoutubeChannelPage(await response.text());
  if (!info) throw new ServiceError('NOT_FOUND', '채널을 찾지 못했습니다. 채널 홈 주소(youtube.com/@핸들)인지 확인해주세요.');
  const data = { youtubeChannelId: info.channelId, youtubeTitle: info.title?.slice(0, 100) ?? null, youtubeUrl: url };
  await prisma.cafeIntegration.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return { channel: data, applying: await autoApplyGate(prisma, userId) };
}

/** 골라둔 자리가 있고 반영할 수 있는 상태면 워커에게 SAVE_GATE 를 시킨다 (설정 완료 시 자동 반영) */
export async function autoApplyGate(prisma: PrismaClient, userId: number): Promise<boolean> {
  const row = await prisma.cafeIntegration.findUnique({ where: { userId } });
  if (!row?.clubId || !row.gateHtml || row.pendingAction || !isPermitted(row.status)) return false;
  const picks = gatePicksSchema.safeParse(row.gatePicks ?? {});
  if (!picks.success || (!picks.data.image && !picks.data.youtube)) return false;
  await prisma.cafeIntegration.update({ where: { userId }, data: { pendingAction: 'SAVE_GATE', requestedAt: new Date() } });
  return true;
}

/* ── 워커 (internal) ── */

export async function listPendingActions(prisma: PrismaClient) {
  const rows = await prisma.cafeIntegration.findMany({
    where: { pendingAction: { not: null }, clubId: { not: null } },
    select: {
      id: true,
      clubId: true,
      cafeName: true,
      pendingAction: true,
      gateHtml: true,
      gatePicks: true,
      youtubeChannelId: true,
      lastSaveSerial: true,
      user: { select: { channelName: true, channelId: true } },
      assets: { select: { scene: true } },
    },
    orderBy: { requestedAt: 'asc' },
  });
  //  SAVE_GATE 는 API 가 계획을 세우고 워커는 DOM 에서 실행만 한다 — 주소·크기·설정 완료 여부를 여기서 안다
  return rows.map(({ gatePicks, youtubeChannelId, lastSaveSerial, assets, ...row }) => {
    const parsed = gatePicksSchema.safeParse(gatePicks ?? {});
    const picks = parsed.success ? parsed.data : EMPTY_PICKS;
    const plan = row.pendingAction === 'SAVE_GATE' && row.gateHtml !== null
      ? buildGatePlan({
          html: row.gateHtml,
          picks,
          image: { ready: assets.some((a) => a.scene === 'live'), src: cafeImageUrl(siteUrl(), row.user.channelId, lastSaveSerial), href: `https://chzzk.naver.com/live/${row.user.channelId}` },
          youtube: { channelId: youtubeChannelId },
        })
      : null;
    return { ...row, picks, plan };
  });
}

export function completeAction(
  prisma: PrismaClient,
  id: number,
  result: { status: CafeLinkStatus; message: string | null },
) {
  return prisma.cafeIntegration.update({
    where: { id },
    data: { pendingAction: null, status: result.status, statusMessage: result.message },
  });
}

export type GateRenderInput = { png: string; width: number; height: number; boxes: GateBox[] };

/** 워커가 대문을 읽고 렌더했다. 대문이 바뀌었으면 고른 자리는 옛 경로라 버린다 */
export async function completeGateFetch(prisma: PrismaClient, id: number, input: { html: string; render: GateRenderInput | null }) {
  const row = await prisma.cafeIntegration.findUnique({ where: { id }, select: { gateHtml: true } });
  const changed = normalizeGateHtml(row?.gateHtml ?? '') !== normalizeGateHtml(input.html);
  return prisma.cafeIntegration.update({
    where: { id },
    data: {
      pendingAction: null,
      statusMessage: null,
      gateHtml: input.html,
      gateFetchedAt: new Date(),
      ...(changed ? { gatePicks: EMPTY_PICKS } : {}),
      gateImage: input.render ? Buffer.from(input.render.png, 'base64') : null,
      gateBoxes: input.render ? input.render.boxes : [],
      gateWidth: input.render?.width ?? null,
      gateHeight: input.render?.height ?? null,
    },
  });
}

/**
 * 워커의 대문 반영 결과. 블록이 하나라도 들어 있으면 ACTIVE(폴링 대상), 아니면 PERMISSION_OK.
 * stale = 대문이 그사이 바뀜 → 고른 자리를 버리고 다시 고르게 한다
 */
export function completeGateSave(
  prisma: PrismaClient,
  id: number,
  result: { ok: true; html: string; picks: GatePicks; render: GateRenderInput | null } | { ok: false; message: string; stale?: boolean },
) {
  if (!result.ok) {
    return prisma.cafeIntegration.update({
      where: { id },
      data: { pendingAction: null, statusMessage: result.message, ...(result.stale ? { gatePicks: EMPTY_PICKS } : {}) },
    });
  }
  const active = findImageTags(result.html).length > 0 || findYoutubeTags(result.html).length > 0;
  return prisma.cafeIntegration.update({
    where: { id },
    data: {
      pendingAction: null,
      status: active ? 'ACTIVE' : 'PERMISSION_OK',
      statusMessage: null,
      gateHtml: result.html,
      gateFetchedAt: new Date(),
      ...(result.render ? { gateUpdatedAt: new Date() } : {}),
      gatePicks: result.picks,
      ...(result.render
        ? { gateImage: Buffer.from(result.render.png, 'base64'), gateBoxes: result.render.boxes, gateWidth: result.render.width, gateHeight: result.render.height }
        : {}),
    },
  });
}

/* ── 방송 상태 폴링·대문 갱신 (#9 PR3b) ── */

/** 폴링 대상 — 켜져 있고 동작 중이며 대문에 이미지 블록이 들어 있는 연동 */
export async function listActive(prisma: PrismaClient) {
  const rows = await prisma.cafeIntegration.findMany({
    where: { enabled: true, status: 'ACTIVE', clubId: { not: null }, pendingAction: null },
    select: { id: true, clubId: true, cafeName: true, gateHtml: true, user: { select: { channelId: true, channelName: true } } },
  });
  return rows
    .filter((r) => r.gateHtml && findImageTags(r.gateHtml).length > 0)
    .map((r) => ({ id: r.id, clubId: r.clubId!, cafeName: r.cafeName, channelId: r.user.channelId, channelName: r.user.channelName }));
}

/**
 * 워커가 가져온 방송 상태로 저장 여부를 판정한다. 판정·일련번호·스냅샷은 전부 DB — 워커가 재시작해도 불필요한 저장이 없다.
 * 저장하기로 하면 일련번호를 올리고 새 이미지 주소를 준다 — <img> 크기는 워커가 대문의 기존 태그(지정한 요소 크기)에서 이어받는다. 이전 저장이 대문에 못 써졌으면(gateSerial 뒤처짐) 1분마다 재시도.
 */
export async function evaluateLive(prisma: PrismaClient, id: number, snapshot: CafeSnapshotInput, now = new Date()) {
  const row = await prisma.cafeIntegration.findUnique({
    where: { id },
    select: { lastSnapshot: true, lastSavedAt: true, lastViewerBucket: true, lastSaveSerial: true, gateSerial: true, saveAttemptedAt: true, user: { select: { channelId: true } } },
  });
  if (!row) return { save: null };
  const stored = cafeSnapshotSchema.safeParse(row.lastSnapshot ?? {});
  const prev = { snapshot: stored.success ? stored.data : null, savedAt: row.lastSavedAt, bucket: row.lastViewerBucket };
  const reason: SaveReason | 'retry' | null = decideSave(prev, snapshot, now) ??
    (row.gateSerial < row.lastSaveSerial && (!row.saveAttemptedAt || now.getTime() - row.saveAttemptedAt.getTime() >= RETRY_MS) ? 'retry' : null);
  if (!reason) return { save: null };

  let serial = row.lastSaveSerial;
  if (reason !== 'retry') {
    serial += 1;
    await prisma.cafeIntegration.update({
      where: { id },
      data: { lastSaveSerial: serial, lastSnapshot: snapshot, lastSavedAt: now, lastViewerBucket: viewerBucket(snapshot.viewers), saveAttemptedAt: now },
    });
  } else {
    await prisma.cafeIntegration.update({ where: { id }, data: { saveAttemptedAt: now } });
  }
  return { save: { reason, serial, src: cafeImageUrl(siteUrl(), row.user.channelId, serial) } };
}
type CafeSnapshotInput = ReturnType<typeof cafeSnapshotSchema.parse>;

/** 워커의 대문 갱신 결과. missing = 대문에서 이미지 블록이 사라짐 → 동작 중지, 자리를 다시 고르게 */
export function reportSave(
  prisma: PrismaClient,
  id: number,
  result: { ok: true; serial: number; html: string } | { ok: false; message: string; missing?: boolean; html?: string },
) {
  if (result.ok) {
    return prisma.cafeIntegration.update({ where: { id }, data: { gateSerial: result.serial, gateHtml: result.html, gateUpdatedAt: new Date(), statusMessage: null } });
  }
  return prisma.cafeIntegration.update({
    where: { id },
    data: {
      statusMessage: result.message,
      ...(result.missing ? { status: 'PERMISSION_OK' as CafeLinkStatus, gatePicks: EMPTY_PICKS } : {}),
      ...(result.html !== undefined ? { gateHtml: result.html } : {}),
    },
  });
}

/** 워커용 — 쿠키 값 그대로. internal 외에는 절대 내려보내지 않는다 */
export function getBotSession(prisma: PrismaClient) {
  return prisma.naverBotSession.findUnique({ where: { id: 1 } });
}

/**
 * 워커의 세션 검사 결과. 만료는 전체 스트리머의 자동화가 멈추는 단일 장애점이라 상태 전이를 돌려준다 —
 * 라우터가 `expired`(유효/미확인 → 만료, 아직 알리지 않음)일 때 운영자에게 메일을 보내고 alertedAt 을 찍는다.
 */
export async function reportSessionCheck(prisma: PrismaClient, result: { valid: boolean; message: string | null }) {
  const prev = await prisma.naverBotSession.findUnique({ where: { id: 1 }, select: { valid: true, alertedAt: true } });
  if (!prev) return { transition: null as 'expired' | 'recovered' | null };
  await prisma.naverBotSession.update({
    where: { id: 1 },
    data: { checkedAt: new Date(), valid: result.valid, checkMessage: result.message, ...(result.valid ? { alertedAt: null } : {}) },
  });
  if (!result.valid && !prev.alertedAt) return { transition: 'expired' as const };
  if (result.valid && prev.valid === false) return { transition: 'recovered' as const };
  return { transition: null };
}

export function markSessionAlerted(prisma: PrismaClient) {
  return prisma.naverBotSession.updateMany({ where: { id: 1 }, data: { alertedAt: new Date() } });
}

/** 스트리머 안내용 — 봇 계정 이름과 세션 상태. 쿠키는 내려가지 않는다 */
export async function getBotStatus(prisma: PrismaClient) {
  const row = await prisma.naverBotSession.findUnique({ where: { id: 1 }, select: { displayName: true, valid: true, checkedAt: true } });
  return row ? { displayName: row.displayName, valid: row.valid, checkedAt: row.checkedAt } : null;
}

/* ── 어드민 ── */

/** 쿠키 값은 끝 4자만 — 화면에 전체를 보일 이유가 없다 */
export async function getBotSessionMasked(prisma: PrismaClient) {
  const row = await prisma.naverBotSession.findUnique({ where: { id: 1 } });
  if (!row) return null;
  const mask = (value: string) => `…${value.slice(-4)}`;
  return {
    displayName: row.displayName,
    nidAut: mask(row.nidAut),
    nidSes: mask(row.nidSes),
    updatedAt: row.updatedAt,
    checkedAt: row.checkedAt,
    valid: row.valid,
    checkMessage: row.checkMessage,
    alertedAt: row.alertedAt,
  };
}

export async function setBotSession(
  prisma: PrismaClient,
  input: { displayName: string; nidAut: string; nidSes: string },
) {
  const data = {
    displayName: input.displayName.trim(),
    nidAut: input.nidAut.trim(),
    nidSes: input.nidSes.trim(),
    //  새 쿠키는 아직 검사 전
    checkedAt: null,
    valid: null,
    checkMessage: null,
    alertedAt: null,
  };
  if (!data.displayName || !data.nidAut || !data.nidSes) {
    throw new ServiceError('INVALID_INPUT', '계정 이름과 두 쿠키 값을 모두 입력해주세요.');
  }
  return prisma.naverBotSession.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}

/* ── 대문 이미지 레이아웃·배경 (#9 PR2) ── */

/** 배경 이미지 크기 제한 — DB(LONGBLOB)에 들어간다 */
export const MAX_BACKGROUND_BYTES = 2 * 1024 * 1024;

export async function getLayout(prisma: PrismaClient, userId: number): Promise<CafeLayout> {
  const row = await prisma.cafeIntegration.findUnique({ where: { userId }, select: { layout: true } });
  const parsed = cafeLayoutSchema.safeParse(row?.layout ?? {});
  return parsed.success ? parsed.data : EMPTY_LAYOUT;
}

export async function saveLayout(prisma: PrismaClient, userId: number, layout: CafeLayout) {
  const data = cafeLayoutSchema.parse(layout);
  await prisma.cafeIntegration.upsert({
    where: { userId },
    update: { layout: data },
    create: { userId, layout: data },
  });
  return data;
}

/** PNG 헤더에서 크기. JPEG 는 SOF 마커를 찾는다 — 업로드 검증용 최소 파서 */
export function imageSize(buffer: Buffer): { width: number; height: number; mimeType: string } | null {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), mimeType: 'image/png' };
  }
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      // SOF0~SOF15 (차등·산술 마커 제외) 에 높이·너비가 있다
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7), mimeType: 'image/jpeg' };
      }
      offset += 2 + length;
    }
  }
  return null;
}

/** 배경 업로드 — base64 로 받아 크기를 읽고 장면별로 1장 저장. 장면 캔버스 크기도 맞춘다 */
export async function uploadBackground(
  prisma: PrismaClient,
  userId: number,
  input: { scene: CafeScene; base64: string },
) {
  const buffer = Buffer.from(input.base64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BACKGROUND_BYTES) {
    throw new ServiceError('INVALID_INPUT', '배경 이미지는 2MB 이하의 PNG 또는 JPEG 여야 합니다.');
  }
  const size = imageSize(buffer);
  if (!size) throw new ServiceError('INVALID_INPUT', 'PNG 또는 JPEG 파일만 올릴 수 있습니다.');
  //  크기 제한은 용량(2MB)뿐. 레이아웃 스키마 상한(4000)만 지킨다
  if (size.width > 4000 || size.height > 4000) {
    throw new ServiceError('INVALID_INPUT', '배경 이미지는 가로·세로 4000px 이하여야 합니다.');
  }

  const integration = await prisma.cafeIntegration.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
  await prisma.cafeAsset.upsert({
    where: { integrationId_scene: { integrationId: integration.id, scene: input.scene } },
    update: { mimeType: size.mimeType, width: size.width, height: size.height, data: buffer },
    create: { integrationId: integration.id, scene: input.scene, mimeType: size.mimeType, width: size.width, height: size.height, data: buffer },
  });
  // 캔버스 크기 = 배경 크기
  const layout = await getLayout(prisma, userId);
  layout[input.scene] = { ...layout[input.scene], width: size.width, height: size.height };
  await saveLayout(prisma, userId, layout);
  const saved = { scene: input.scene, width: size.width, height: size.height, bytes: buffer.length };
  //  방송 중 배경이 생겼으면 골라둔 이미지 자리를 반영한다
  if (input.scene === 'live') await autoApplyGate(prisma, userId);
  return saved;
}

export async function deleteBackground(prisma: PrismaClient, userId: number, scene: CafeScene) {
  const integration = await prisma.cafeIntegration.findUnique({ where: { userId }, select: { id: true } });
  if (!integration) return;
  await prisma.cafeAsset.deleteMany({ where: { integrationId: integration.id, scene } });
}

/** 배경 유무·크기 — 에디터용 (바이트는 렌더 경로로만) */
export async function listBackgrounds(prisma: PrismaClient, userId: number) {
  const integration = await prisma.cafeIntegration.findUnique({
    where: { userId },
    select: { assets: { select: { scene: true, width: true, height: true, mimeType: true, createdAt: true } } },
  });
  return integration?.assets ?? [];
}

/**
 * 렌더 데이터 — web 의 /cafe/{channelId}.png 가 부른다 (public).
 * v 를 주면 그 일련번호의 스냅샷(= 워커가 저장한 상태), preview 면 샘플 데이터.
 * 배경 바이트는 base64 로 함께 — 렌더 결과는 v 로 영구 캐시되므로 부담이 없다.
 */
export async function getRenderData(
  prisma: PrismaClient,
  input: { channelId: string; scene?: CafeScene; preview: boolean },
) {
  const user = await prisma.user.findUnique({
    where: { channelId: input.channelId },
    select: { cafeIntegration: { include: { assets: true } } },
  });
  const integration = user?.cafeIntegration;
  if (!integration || (!integration.enabled && !input.preview)) return null;

  const layout = cafeLayoutSchema.safeParse(integration.layout ?? {});
  const parsedLayout = layout.success ? layout.data : EMPTY_LAYOUT;

  let snapshot;
  if (input.preview) {
    //  방송 중이면 실제 데이터로, 아니면 샘플로 — 방송을 켜지 않아도 배치를 볼 수 있게
    const live = input.scene !== 'offline' ? await fetchLiveSnapshot(input.channelId) : null;
    snapshot = live?.live ? live : SAMPLE_SNAPSHOT[input.scene ?? 'live'];
  } else {
    const stored = cafeSnapshotSchema.safeParse(integration.lastSnapshot ?? {});
    snapshot = stored.success ? stored.data : SAMPLE_SNAPSHOT.offline;
  }
  const scene: CafeScene = input.preview ? (input.scene ?? 'live') : snapshot.live ? 'live' : 'offline';
  const asset = integration.assets.find((a) => a.scene === scene) ?? null;

  return {
    scene,
    layout: parsedLayout[scene],
    snapshot,
    /** 샘플 데이터인지 — 렌더가 자리표시 썸네일을 그릴지 정한다 */
    sample: input.preview && snapshot === SAMPLE_SNAPSHOT[scene],
    serial: integration.lastSaveSerial,
    background: asset
      ? { mimeType: asset.mimeType, width: asset.width, height: asset.height, base64: Buffer.from(asset.data).toString('base64') }
      : null,
  };
}
