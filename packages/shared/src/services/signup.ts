import type { PrismaClient, SignupApplication } from '@prisma/client';
import type { ChzzkTokenSet, TokenStore } from 'chzzk-open-sdk';

import { createChzzkClientWithStore } from './chzzkClient';
import { ServiceError } from './errors';
import { type InitialCommands, provisionStreamer } from './provision';

/**
 * 사이트 내 사용 신청 (#96).
 *
 * 치지직 OAuth 가 곧 본인 인증이다 — 로그인 콜백에서 channelId·channelName·channelImageUrl 을
 * 이미 손에 쥔 상태이므로, 신청자가 채널 ID 를 찾아 적을 필요도 별도 인증 수단도 없다.
 * 이 서비스의 입력은 전부 그 OAuth 결과에서 온다.
 */

/** SiteSetting 키. 값은 'true' | 'false' */
export const AUTO_APPROVE_KEY = 'signup.autoApprove';
export const ASK_REASON_KEY = 'signup.askReason';

export type SignupSettings = {
  /** 켜면 신청 즉시 화이트리스트 등록. 기본 꺼짐 */
  autoApprove: boolean;
  /** 신청 화면에 사유 입력칸을 보일지. 기본 켜짐 */
  askReason: boolean;
};

export type ChannelIdentity = {
  channelId: string;
  channelName: string;
  channelImageUrl: string | null;
};

/* ── 신청 대기자 토큰 (#151) ── */

/** 만료 6시간 전부터 갱신 대상. access token 수명이 1일이라 하루 1회꼴이다 */
export const REFRESH_AHEAD_MS = 6 * 60 * 60 * 1000;
/** 승인도 안 된 사람의 자격증명을 무기한 살려두지 않는다 */
export const PENDING_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const NO_TOKENS = {
  accessToken: null,
  refreshToken: null,
  tokenType: null,
  tokenExpiresAt: null,
  tokenRefreshedAt: null,
};

function tokensToRow(tokens: ChzzkTokenSet) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: tokens.tokenType,
    tokenExpiresAt: new Date(tokens.obtainedAt + tokens.expiresIn * 1000),
    tokenRefreshedAt: new Date(),
  };
}

type TokenRow = Pick<
  SignupApplication,
  'accessToken' | 'refreshToken' | 'tokenType' | 'tokenExpiresAt'
>;

/** 행에 토큰이 있으면 SDK 형식으로. 만료 시각을 남은 초로 바꾼다 (PrismaTokenStore 와 같은 규칙) */
export function rowToTokens(row: TokenRow): ChzzkTokenSet | null {
  if (!row.accessToken || !row.refreshToken || !row.tokenType || !row.tokenExpiresAt) return null;
  const now = Date.now();
  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    tokenType: row.tokenType,
    expiresIn: Math.floor((row.tokenExpiresAt.getTime() - now) / 1000),
    obtainedAt: now,
  };
}

/** SignupApplication 행을 SDK TokenStore 로 노출한다 — refresh token 이 일회용이라 set 이 반드시 저장돼야 한다 */
export class ApplicationTokenStore implements TokenStore {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly id: number,
  ) {}

  async get() {
    const row = await this.prisma.signupApplication.findUnique({ where: { id: this.id } });
    return row ? rowToTokens(row) : null;
  }

  async set(tokens: ChzzkTokenSet) {
    await this.prisma.signupApplication.update({ where: { id: this.id }, data: tokensToRow(tokens) });
  }

  async clear() {
    await this.prisma.signupApplication.update({ where: { id: this.id }, data: NO_TOKENS });
  }
}

/**
 * 대기 중인 신청의 토큰을 갱신한다. 워커의 60초 폴링이 호출하고, 실제로는 만료 6시간 전인
 * 것만 골라 하루 1회꼴로 돈다. 30일 넘게 대기한 것과 갱신에 실패한 것은 토큰을 지운다 —
 * 그 신청은 /apply 가 "다시 로그인해 주세요" 를 띄우고, 승인은 재로그인 후 봇이 붙는다.
 */
export async function refreshPendingTokens(prisma: PrismaClient) {
  const now = Date.now();
  const rows = await prisma.signupApplication.findMany({
    where: { status: 'PENDING', refreshToken: { not: null } },
    select: { id: true, channelName: true, createdAt: true, tokenExpiresAt: true },
  });

  let refreshed = 0;
  let cleared = 0;
  for (const row of rows) {
    if (now - row.createdAt.getTime() > PENDING_MAX_AGE_MS) {
      await new ApplicationTokenStore(prisma, row.id).clear();
      cleared++;
      continue;
    }
    if (row.tokenExpiresAt && row.tokenExpiresAt.getTime() - now > REFRESH_AHEAD_MS) continue;

    const store = new ApplicationTokenStore(prisma, row.id);
    try {
      await createChzzkClientWithStore(store).auth.refresh();
      refreshed++;
    } catch {
      // refresh token 만료·회수 — 재로그인 외에 방법이 없다
      await store.clear();
      cleared++;
    }
  }
  return { refreshed, cleared, candidates: rows.length };
}

/* ── 사이트 전역 설정 ── */

export async function getSettings(prisma: PrismaClient): Promise<SignupSettings> {
  const rows = await prisma.siteSetting.findMany({
    where: { key: { in: [AUTO_APPROVE_KEY, ASK_REASON_KEY] } },
  });
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    //  기본값은 꺼짐 — 켜두면 사실상 누구나 가입되고, 챗봇은 채널마다 실시간 연결을 유지하므로
    //  무분별한 가입이 그대로 리소스 부담이 된다
    autoApprove: value(AUTO_APPROVE_KEY) === 'true',
    //  설정이 없으면 보인다
    askReason: value(ASK_REASON_KEY) !== 'false',
  };
}

export async function getAutoApprove(prisma: PrismaClient): Promise<boolean> {
  return (await getSettings(prisma)).autoApprove;
}

export async function setSettings(prisma: PrismaClient, patch: Partial<SignupSettings>) {
  const entries: [string, boolean | undefined][] = [
    [AUTO_APPROVE_KEY, patch.autoApprove],
    [ASK_REASON_KEY, patch.askReason],
  ];
  for (const [key, enabled] of entries) {
    if (enabled === undefined) continue;
    const value = enabled ? 'true' : 'false';
    await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  return getSettings(prisma);
}

/* ── 로그인 콜백 ── */

/**
 * 화이트리스트에 없는 채널이 로그인했을 때. 신청 레코드를 만들거나(첫 방문) 채널 정보를
 * 갱신한다(재방문). 상태는 건드리지 않는다 — 거절된 채널이 다시 로그인해도 REJECTED 로 남아
 * 재신청은 submitReason 으로만 일어난다.
 *
 * @returns created — 이번에 새로 만들어졌는지 (어드민 알림 여부를 호출자가 정한다)
 */
export async function upsertOnLogin(
  prisma: PrismaClient,
  identity: ChannelIdentity,
  tokens: ChzzkTokenSet,
) {
  //  로그인할 때마다 새 토큰으로 덮는다 — 대기 중 갱신이 끊겼던 신청도 이걸로 되살아난다
  const tokenRow = tokensToRow(tokens);
  const existing = await prisma.signupApplication.findUnique({
    where: { channelId: identity.channelId },
  });
  if (existing) {
    const application = await prisma.signupApplication.update({
      where: { id: existing.id },
      data: {
        channelName: identity.channelName,
        channelImageUrl: identity.channelImageUrl,
        ...tokenRow,
      },
    });
    return { application, created: false };
  }
  const application = await prisma.signupApplication.create({
    data: { ...identity, ...tokenRow },
  });
  return { application, created: true };
}

/**
 * 승인 후 스트리머의 첫 로그인 — 채팅 안내를 멈추는 신호. 인터락의 스트리머 경로가 부른다.
 * 승인 신청이 없거나(직접 등록) 이미 찍혀 있으면 아무 일도 없다.
 */
export async function acknowledge(prisma: PrismaClient, channelId: string) {
  await prisma.signupApplication.updateMany({
    where: { channelId, status: 'APPROVED', acknowledgedAt: null },
    data: { acknowledgedAt: new Date() },
  });
}

/** 승인됐지만 아직 로그인하지 않은 채널 — 워커가 채팅으로 안내할 대상 (#151) */
export async function pendingNoticeChannelIds(prisma: PrismaClient) {
  const rows = await prisma.signupApplication.findMany({
    where: { status: 'APPROVED', acknowledgedAt: null },
    select: { channelId: true },
  });
  return new Set(rows.map((row) => row.channelId));
}

/**
 * 자동 승인이 켜져 있을 때 — 신청과 승인·화이트리스트 등록을 한 번에.
 * 로그인 콜백이 이어서 일반 로그인 경로를 타면 된다.
 */
export async function autoApprove(prisma: PrismaClient, identity: ChannelIdentity) {
  return prisma.$transaction(async (tx) => {
    //  로그인 중이므로 안내할 필요가 없다 — acknowledgedAt 을 바로 찍는다
    const now = new Date();
    const stamp = { status: 'APPROVED' as const, processedAt: now, acknowledgedAt: now, rejectReason: null };
    const application = await tx.signupApplication.upsert({
      where: { channelId: identity.channelId },
      update: { ...identity, ...stamp, ...NO_TOKENS },
      create: { ...identity, ...stamp },
    });
    await ensureWhitelisted(tx, identity);
    return application;
  });
}

/* ── 신청자 ── */

export async function getMine(prisma: PrismaClient, id: number) {
  const application = await prisma.signupApplication.findUnique({ where: { id } });
  if (!application) throw new ServiceError('NOT_FOUND', '신청 정보를 찾을 수 없습니다.');
  const whitelisted = !!(await prisma.whitelist.findUnique({
    where: { channelId: application.channelId },
    select: { id: true },
  }));
  const { askReason } = await getSettings(prisma);
  const { accessToken, refreshToken, tokenType, tokenExpiresAt, ...safe } = application;
  //  토큰 값은 절대 내려보내지 않는다 — 생존 여부만
  const tokenAlive = rowToTokens({ accessToken, refreshToken, tokenType, tokenExpiresAt }) !== null;
  return { ...safe, whitelisted, askReason, tokenAlive };
}

/**
 * 사유를 적는다. 거절된 신청이면 다시 대기로 돌린다(재신청).
 * 승인됐다가 화이트리스트에서 해제된 채널도 같은 경로로 재신청한다.
 *
 * @returns reapplied — 상태가 PENDING 으로 되돌아갔는지 (어드민 알림 여부)
 */
export async function submitReason(prisma: PrismaClient, id: number, reasonInput: string) {
  const reason = reasonInput.trim().slice(0, 500) || null;
  const existing = await prisma.signupApplication.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('NOT_FOUND', '신청 정보를 찾을 수 없습니다.');

  let reapplied = false;
  let data: Parameters<typeof prisma.signupApplication.update>[0]['data'] = { reason };

  if (existing.status === 'REJECTED') {
    reapplied = true;
  } else if (existing.status === 'APPROVED') {
    // 승인됐는데 화이트리스트에 없다 = 해제된 채널. 재신청으로 취급한다
    const whitelisted = await prisma.whitelist.findUnique({
      where: { channelId: existing.channelId },
      select: { id: true },
    });
    if (whitelisted) throw new ServiceError('CONFLICT', '이미 승인된 신청입니다.');
    reapplied = true;
  }
  if (reapplied) {
    data = { reason, status: 'PENDING', rejectReason: null, processedAt: null, processedById: null };
  }

  const application = await prisma.signupApplication.update({ where: { id }, data });
  return { application, reapplied };
}

/* ── 어드민 ── */

/**
 * 어드민 목록 — 대기·거절만. 승인된 신청은 화이트리스트로 "이동"한 것으로 보고 여기서 뺀다
 * (레코드는 남는다: 승인 이력과 #151 의 승인 후 첫 로그인 판정에 쓴다).
 */
export async function listApplications(prisma: PrismaClient) {
  const [applications, whitelist] = await Promise.all([
    prisma.signupApplication.findMany({
      where: { status: { in: ['PENDING', 'REJECTED'] } },
      include: { processedBy: { select: { email: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    }),
    prisma.whitelist.findMany({ select: { channelId: true } }),
  ]);
  const whitelisted = new Set(whitelist.map((w) => w.channelId));
  //  enum 순서(PENDING·APPROVED·REJECTED)가 곧 정렬 순서다 — 대기 중인 것이 위로 온다
  return applications.map(({ accessToken, refreshToken, tokenType, tokenExpiresAt, ...safe }) => ({
    ...safe,
    whitelisted: whitelisted.has(safe.channelId),
    /** 토큰이 살아 있으면 승인 즉시 봇이 붙는다. 아니면 재로그인 후에 붙는다 */
    tokenAlive: rowToTokens({ accessToken, refreshToken, tokenType, tokenExpiresAt }) !== null,
  }));
}

/**
 * 승인 — 화이트리스트 등록 + 스트리머 계정 프로비저닝까지 한 번에 (#151).
 * 신청 시점 토큰이 살아 있으면 OAuthCredential 로 옮겨 워커가 다음 폴링(≤60초)에 붙는다.
 * 토큰이 없으면(만료·30일 경과) 계정만 만들어 두고, 스트리머가 로그인하면 그때 토큰이 들어온다.
 */
export async function approve(
  prisma: PrismaClient,
  id: number,
  adminId: number,
  options: { initialCommands: InitialCommands },
) {
  const existing = await prisma.signupApplication.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('NOT_FOUND', '존재하지 않는 신청입니다.');

  const tokens = rowToTokens(existing);
  const application = await prisma.$transaction(async (tx) => {
    const updated = await tx.signupApplication.update({
      where: { id },
      data: {
        status: 'APPROVED',
        rejectReason: null,
        processedAt: new Date(),
        processedById: adminId,
        acknowledgedAt: null,
        //  토큰은 OAuthCredential 로 옮긴다 — 여기 남겨두지 않는다
        ...NO_TOKENS,
      },
    });
    await ensureWhitelisted(tx, existing);
    return updated;
  });

  await provisionStreamer(
    prisma,
    {
      channelId: existing.channelId,
      channelName: existing.channelName,
      channelImageUrl: existing.channelImageUrl,
    },
    { tokens, initialCommands: options.initialCommands },
  );

  return { ...application, botConnects: tokens !== null };
}

export async function reject(
  prisma: PrismaClient,
  id: number,
  adminId: number,
  reasonInput?: string,
) {
  const existing = await prisma.signupApplication.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('NOT_FOUND', '존재하지 않는 신청입니다.');
  const rejectReason = reasonInput?.trim().slice(0, 500) || null;
  return prisma.signupApplication.update({
    where: { id },
    //  거절과 동시에 토큰을 지운다 — 승인도 안 된 사람의 자격증명을 들고 있지 않는다
    data: { status: 'REJECTED', rejectReason, processedAt: new Date(), processedById: adminId, ...NO_TOKENS },
  });
}

/**
 * 화이트리스트 등록. whitelistService.addToWhitelist 와 달리 치지직에 채널 존재를 다시 묻지
 * 않는다 — 여기 오는 값은 OAuth 로 이미 확인된 것이라 중복 조회다.
 */
async function ensureWhitelisted(
  tx: Pick<PrismaClient, 'whitelist'>,
  identity: Pick<SignupApplication, 'channelId' | 'channelName'>,
) {
  await tx.whitelist.upsert({
    where: { channelId: identity.channelId },
    update: { nickname: identity.channelName },
    create: { channelId: identity.channelId, nickname: identity.channelName },
  });
}
