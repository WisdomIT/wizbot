import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

/** 공지사항 (#206) — 어드민이 쓰고 누구나 읽는다. 본문은 마크다운(GFM) */

export function listPublic(prisma: PrismaClient, limit = 20) {
  return prisma.notice.findMany({
    orderBy: { id: 'desc' },
    take: limit,
    select: { id: true, title: true, createdAt: true },
  });
}

export async function getPublic(prisma: PrismaClient, id: number) {
  const notice = await prisma.notice.findUnique({ where: { id } });
  if (!notice) throw new ServiceError('NOT_FOUND', '공지사항을 찾을 수 없습니다.');
  return notice;
}

/** 어드민 목록 (#298) — 공지마다 읽은 스트리머 수, 분모로 전체 스트리머 수 */
export async function listAdmin(prisma: PrismaClient) {
  const [notices, streamerCount] = await Promise.all([
    prisma.notice.findMany({ orderBy: { id: 'desc' }, include: { _count: { select: { reads: true } } } }),
    prisma.user.count(),
  ]);
  return {
    notices: notices.map(({ _count, ...notice }) => ({ ...notice, readCount: _count.reads })),
    streamerCount,
  };
}

/**
 * 공지를 읽은 스트리머와 아직 안 읽은 스트리머 (#298) — 팝업을 내릴 시점 판단용.
 * 둘 다 팔로워 많은 순 (주요 스트리머가 봤는지가 목적). 읽음은 읽은 시각도 함께
 */
export async function adminReads(prisma: PrismaClient, noticeId: number) {
  const notice = await prisma.notice.findUnique({ where: { id: noticeId }, select: { id: true } });
  if (!notice) throw new ServiceError('NOT_FOUND', '공지사항을 찾을 수 없습니다.');
  const select = { id: true, channelId: true, channelName: true, channelImageUrl: true, followerCount: true };
  const [reads, users] = await Promise.all([
    prisma.noticeRead.findMany({ where: { noticeId }, select: { readAt: true, user: { select } } }),
    prisma.user.findMany({ select }),
  ]);
  const byFollowers = <T extends { followerCount: number | null; id: number }>(a: T, b: T) =>
    (b.followerCount ?? -1) - (a.followerCount ?? -1) || a.id - b.id;
  const readIds = new Set(reads.map((row) => row.user.id));
  return {
    read: reads.map((row) => ({ ...row.user, readAt: row.readAt })).sort(byFollowers),
    unread: users.filter((user) => !readIds.has(user.id)).sort(byFollowers),
  };
}

export function create(prisma: PrismaClient, input: { title: string; body: string; popup: boolean }) {
  return prisma.notice.create({ data: input });
}

export function update(prisma: PrismaClient, id: number, input: { title: string; body: string; popup: boolean }) {
  return prisma.notice.update({ where: { id }, data: input });
}

export function remove(prisma: PrismaClient, id: number) {
  return prisma.notice.delete({ where: { id } });
}

/* ── 읽음·팝업 (#206 2/3) ── */

/**
 * 안 읽은 공지 수와, 띄워야 할 팝업 공지 하나 (가장 최근 것).
 * 읽음 = NoticeRead 행 존재 — 목록을 열면 전부 읽음 처리되고, 팝업은 「확인」이 읽음 처리다.
 */
export async function unreadFor(prisma: PrismaClient, userId: number) {
  const readIds = (await prisma.noticeRead.findMany({ where: { userId }, select: { noticeId: true } })).map((r) => r.noticeId);
  const count = await prisma.notice.count({ where: { id: { notIn: readIds } } });
  const popup = count === 0 ? null : await prisma.notice.findFirst({ where: { popup: true, id: { notIn: readIds } }, orderBy: { id: 'desc' } });
  return { count, popup };
}

export async function markRead(prisma: PrismaClient, userId: number, noticeId: number) {
  await prisma.noticeRead.upsert({
    where: { noticeId_userId: { noticeId, userId } },
    update: {},
    create: { noticeId, userId },
  });
}

/** 목록을 열었을 때 — 지금 있는 공지를 전부 읽음으로 */
export async function markAllRead(prisma: PrismaClient, userId: number) {
  const notices = await prisma.notice.findMany({ select: { id: true } });
  await prisma.noticeRead.createMany({
    data: notices.map((notice) => ({ noticeId: notice.id, userId })),
    skipDuplicates: true,
  });
}
