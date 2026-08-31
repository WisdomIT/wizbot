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

export function listAdmin(prisma: PrismaClient) {
  return prisma.notice.findMany({ orderBy: { id: 'desc' } });
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
