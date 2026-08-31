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
