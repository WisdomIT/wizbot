import type { PrismaClient, SignupApplication } from '@prisma/client';

import { ServiceError } from './errors';

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
export async function upsertOnLogin(prisma: PrismaClient, identity: ChannelIdentity) {
  const existing = await prisma.signupApplication.findUnique({
    where: { channelId: identity.channelId },
  });
  if (existing) {
    const application = await prisma.signupApplication.update({
      where: { id: existing.id },
      data: { channelName: identity.channelName, channelImageUrl: identity.channelImageUrl },
    });
    return { application, created: false };
  }
  const application = await prisma.signupApplication.create({ data: identity });
  return { application, created: true };
}

/**
 * 자동 승인이 켜져 있을 때 — 신청과 승인·화이트리스트 등록을 한 번에.
 * 로그인 콜백이 이어서 일반 로그인 경로를 타면 된다.
 */
export async function autoApprove(prisma: PrismaClient, identity: ChannelIdentity) {
  return prisma.$transaction(async (tx) => {
    const application = await tx.signupApplication.upsert({
      where: { channelId: identity.channelId },
      update: { ...identity, status: 'APPROVED', processedAt: new Date(), rejectReason: null },
      create: { ...identity, status: 'APPROVED', processedAt: new Date() },
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
  return { ...application, whitelisted, askReason };
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
  return applications.map((application) => ({
    ...application,
    whitelisted: whitelisted.has(application.channelId),
  }));
}

export async function approve(prisma: PrismaClient, id: number, adminId: number) {
  const existing = await prisma.signupApplication.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('NOT_FOUND', '존재하지 않는 신청입니다.');

  return prisma.$transaction(async (tx) => {
    const application = await tx.signupApplication.update({
      where: { id },
      data: { status: 'APPROVED', rejectReason: null, processedAt: new Date(), processedById: adminId },
    });
    await ensureWhitelisted(tx, existing);
    return application;
  });
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
    data: { status: 'REJECTED', rejectReason, processedAt: new Date(), processedById: adminId },
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
