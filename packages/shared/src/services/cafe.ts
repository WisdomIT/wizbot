import type { CafeAction, CafeLinkStatus, PrismaClient } from '@prisma/client';

import { isYoutubeChannelId, parseCafeSlug, parseClubInfo } from '../lib/cafe';
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
  youtubeWidth: 560,
  youtubeHeight: 315,
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

export async function setYoutube(
  prisma: PrismaClient,
  userId: number,
  input: { channelId: string | null; width: number; height: number },
) {
  const channelId = input.channelId?.trim() || null;
  if (channelId && !isYoutubeChannelId(channelId)) {
    throw new ServiceError('INVALID_INPUT', '유튜브 채널 ID 는 UC 로 시작하는 24자입니다.');
  }
  const data = { youtubeChannelId: channelId, youtubeWidth: input.width, youtubeHeight: input.height };
  return prisma.cafeIntegration.upsert({ where: { userId }, update: data, create: { userId, ...data } });
}

/* ── 워커 (internal) ── */

export function listPendingActions(prisma: PrismaClient) {
  return prisma.cafeIntegration.findMany({
    where: { pendingAction: { not: null }, clubId: { not: null } },
    select: {
      id: true,
      clubId: true,
      cafeName: true,
      pendingAction: true,
      user: { select: { channelName: true } },
    },
    orderBy: { requestedAt: 'asc' },
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

/** 워커용 — 쿠키 값 그대로. internal 외에는 절대 내려보내지 않는다 */
export function getBotSession(prisma: PrismaClient) {
  return prisma.naverBotSession.findUnique({ where: { id: 1 } });
}

export function reportSessionCheck(prisma: PrismaClient, result: { valid: boolean; message: string | null }) {
  return prisma.naverBotSession.updateMany({
    where: { id: 1 },
    data: { checkedAt: new Date(), valid: result.valid, checkMessage: result.message },
  });
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
  };
  if (!data.displayName || !data.nidAut || !data.nidSes) {
    throw new ServiceError('INVALID_INPUT', '계정 이름과 두 쿠키 값을 모두 입력해주세요.');
  }
  return prisma.naverBotSession.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}
