import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

/**
 * 문의사항 (#206 3/3). 스트리머 콘솔에서만 쓰고, 어드민이 답한다. 본문은 마크다운(GFM).
 * 새 글 표시: 각자 스레드를 연 시각(streamerReadAt/adminReadAt)보다 늦은 상대 메시지가 있으면 안 읽음.
 */

export const INQUIRY_STATUS_LABEL = { OPEN: '답변 대기', ANSWERED: '답변 완료' } as const;

/* ── 스트리머 ── */

export async function listMine(prisma: PrismaClient, userId: number) {
  const rows = await prisma.inquiry.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    include: { messages: { where: { author: 'ADMIN' }, orderBy: { id: 'desc' }, take: 1, select: { createdAt: true } } },
  });
  return rows.map(({ messages, ...row }) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    unread: !!messages[0] && (!row.streamerReadAt || messages[0].createdAt > row.streamerReadAt),
  }));
}

/** 스레드 조회 — 열면 읽음 처리(점 표시가 꺼진다) */
export async function getMine(prisma: PrismaClient, userId: number, id: number) {
  const inquiry = await prisma.inquiry.findFirst({
    where: { id, userId },
    include: { messages: { orderBy: { id: 'asc' } } },
  });
  if (!inquiry) throw new ServiceError('NOT_FOUND', '문의를 찾을 수 없습니다.');
  await prisma.inquiry.update({ where: { id }, data: { streamerReadAt: new Date(), updatedAt: inquiry.updatedAt } });
  return inquiry;
}

export async function create(prisma: PrismaClient, userId: number, input: { title: string; body: string }) {
  return prisma.inquiry.create({
    data: {
      userId,
      title: input.title,
      streamerReadAt: new Date(),
      messages: { create: { author: 'STREAMER', body: input.body } },
    },
  });
}

export async function reply(prisma: PrismaClient, userId: number, id: number, body: string) {
  const inquiry = await prisma.inquiry.findFirst({ where: { id, userId }, select: { id: true, title: true } });
  if (!inquiry) throw new ServiceError('NOT_FOUND', '문의를 찾을 수 없습니다.');
  await prisma.inquiry.update({
    where: { id },
    //  스트리머가 덧붙이면 다시 답변 대기
    data: { status: 'OPEN', streamerReadAt: new Date(), messages: { create: { author: 'STREAMER', body } } },
  });
  return inquiry;
}

/** 사이드바 점 표시 — 어드민 답변이 달린 뒤 안 연 문의 수 */
export async function unreadMine(prisma: PrismaClient, userId: number) {
  const rows = await listMine(prisma, userId);
  return { count: rows.filter((row) => row.unread).length };
}

/* ── 어드민 ── */

export async function listAdmin(prisma: PrismaClient) {
  const rows = await prisma.inquiry.findMany({
    orderBy: { id: 'desc' },
    include: {
      user: { select: { channelName: true, channelId: true } },
      messages: { where: { author: 'STREAMER' }, orderBy: { id: 'desc' }, take: 1, select: { createdAt: true } },
    },
  });
  return rows.map(({ messages, user, ...row }) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    channelName: user.channelName,
    unread: !!messages[0] && (!row.adminReadAt || messages[0].createdAt > row.adminReadAt),
  }));
}

export async function getAdmin(prisma: PrismaClient, id: number) {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id },
    include: { user: { select: { channelName: true, channelId: true } }, messages: { orderBy: { id: 'asc' } } },
  });
  if (!inquiry) throw new ServiceError('NOT_FOUND', '문의를 찾을 수 없습니다.');
  await prisma.inquiry.update({ where: { id }, data: { adminReadAt: new Date(), updatedAt: inquiry.updatedAt } });
  return inquiry;
}

export async function replyAdmin(prisma: PrismaClient, id: number, body: string) {
  const inquiry = await prisma.inquiry.findUnique({ where: { id }, select: { id: true } });
  if (!inquiry) throw new ServiceError('NOT_FOUND', '문의를 찾을 수 없습니다.');
  return prisma.inquiry.update({
    where: { id },
    data: { status: 'ANSWERED', adminReadAt: new Date(), messages: { create: { author: 'ADMIN', body } } },
  });
}

export async function unreadAdmin(prisma: PrismaClient) {
  const rows = await listAdmin(prisma);
  return { count: rows.filter((row) => row.unread).length };
}
