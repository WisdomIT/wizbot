import type { AuditActor, PrismaClient } from '@prisma/client';

import { recordAccess } from './accessLog';
import { ServiceError } from './errors';

/* ── 처리 대기 집계 (#302) ── */

/**
 * 어드민이 손대야 할 것의 건수 — 사이드바 배지·기본 페이지 요약이 같이 쓴다.
 * 메일·디스코드 알림은 각각 나가지만, 놓쳤거나 나중에 콘솔을 열었을 때 무엇이 남았는지 보여주는 용도
 */
export async function attention(prisma: PrismaClient) {
  const [applications, joinRequests, inquiries] = await Promise.all([
    prisma.signupApplication.count({ where: { status: 'PENDING' } }),
    prisma.cafeIntegration.count({ where: { status: 'JOIN_REQUESTED' } }),
    //  OPEN = 스트리머가 마지막으로 쓴 스레드(답변 대기). 열어봤는지와 무관
    prisma.inquiry.count({ where: { status: 'OPEN' } }),
  ]);
  return { applications, joinRequests, inquiries };
}

/* ── 스트리머 관리 (#10 PR B) ── */

export async function listStreamers(prisma: PrismaClient) {
  const users = await prisma.user.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      channelId: true,
      channelName: true,
      channelImageUrl: true,
      hidden: true,
      followerCount: true,
      createdAt: true,
      oauth: { select: { expiresIn: true } },
      _count: {
        select: { echoCommands: true, functionCommands: true, repeatCommands: true },
      },
    },
  });
  const whitelist = await prisma.whitelist.findMany({ select: { channelId: true } });
  const whitelisted = new Set(whitelist.map((entry) => entry.channelId));

  return users.map((user) => ({
    id: user.id,
    channelId: user.channelId,
    channelName: user.channelName,
    channelImageUrl: user.channelImageUrl,
    hidden: user.hidden,
    followerCount: user.followerCount,
    /** 가입 시각 (#297) */
    createdAt: user.createdAt,
    /** 화이트리스트에 남아 있는지 (없으면 재로그인 불가 상태) */
    whitelisted: whitelisted.has(user.channelId),
    /** 치지직 연동 여부 (access token 만료 시각 — refresh 로 자동 갱신되므로 참고용) */
    oauthExpiresAt: user.oauth?.expiresIn ?? null,
    commandCount: user._count.echoCommands + user._count.functionCommands,
    repeatCount: user._count.repeatCommands,
  }));
}

export async function setStreamerHidden(prisma: PrismaClient, userId: number, hidden: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError('NOT_FOUND', '존재하지 않는 스트리머입니다.');
  return prisma.user.update({ where: { id: userId }, data: { hidden } });
}

/**
 * 탈퇴 처리 — User 및 연관 데이터(명령어·설정·토큰 등, onDelete: Cascade) 전부 삭제.
 * 화이트리스트 항목은 별개(입장권)라 남는다 — 재가입을 막으려면 화이트리스트에서도 삭제할 것.
 * 챗봇 워커는 다음 폴링(≤60초)에서 채널 연결을 정리한다.
 */
/**
 * 탈퇴 처리 — 본인(user.deleteSelf)과 어드민(admin.deleteStreamer)이 같이 쓴다. 연관 데이터는 스키마 cascade.
 * 감사 기록(#254)은 둘로 나눈다: 설정 변경 기록은 계정과 함께 지우고, 접근 기록(access.*)은 남긴다 —
 * FK 가 SetNull 이라 userId 만 비고 채널 식별자는 input 에 남아 있다. 탈퇴 자체도 access.withdraw 로 남긴다.
 */
export async function deleteStreamer(
  prisma: PrismaClient,
  userId: number,
  options: { removeWhitelist?: boolean; actor?: { type: AuditActor; id: number } } = {},
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError('NOT_FOUND', '존재하지 않는 스트리머입니다.');
  //  user 를 지우기 전에 — 지운 뒤엔 userId 가 비어 어느 계정 것이었는지 찾을 수 없다
  await prisma.auditLog.deleteMany({ where: { userId, NOT: { procedure: { startsWith: 'access.' } } } });
  await prisma.user.delete({ where: { id: userId } });
  await recordAccess(prisma, {
    procedure: 'access.withdraw',
    actorType: options.actor?.type ?? 'STREAMER',
    actorId: options.actor?.id ?? userId,
    subject: { channelId: user.channelId, channelName: user.channelName },
  });
  // 화이트리스트 = 입장권. 기본은 남긴다(다시 로그인하면 재가입). 같이 지우면 재로그인도 막힌다 (#96)
  if (options.removeWhitelist) {
    await prisma.whitelist.deleteMany({ where: { channelId: user.channelId } });
  }
  return user;
}

/* ── 관리자 계정 관리 (#10 PR B) ── */

export function listAdmins(prisma: PrismaClient) {
  return prisma.admin.findMany({ orderBy: { id: 'asc' }, select: { id: true, email: true } });
}

export async function addAdmin(prisma: PrismaClient, emailInput: string) {
  const email = emailInput.trim().toLowerCase();

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) throw new ServiceError('CONFLICT', '이미 등록된 관리자 이메일입니다.');

  // ⚠ 매직 링크 방식이라 이메일 소유자 = 관리자. 오타는 곧 권한 오발급이므로 UI 에서 재확인한다
  return prisma.admin.create({ data: { email }, select: { id: true, email: true } });
}

export async function removeAdmin(prisma: PrismaClient, id: number, requesterId: number) {
  if (id === requesterId) {
    throw new ServiceError('FORBIDDEN', '자기 자신은 삭제할 수 없습니다.');
  }
  const existing = await prisma.admin.findUnique({ where: { id } });
  if (!existing) throw new ServiceError('NOT_FOUND', '존재하지 않는 관리자입니다.');

  const total = await prisma.admin.count();
  if (total <= 1) {
    throw new ServiceError('FORBIDDEN', '마지막 관리자 계정은 삭제할 수 없습니다.');
  }

  await prisma.admin.delete({ where: { id } });
  return existing;
}
