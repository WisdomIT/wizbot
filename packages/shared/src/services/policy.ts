import type { PolicyType, PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

/**
 * 약관 문서 (#252) — 서비스 이용약관·개인정보처리방침.
 * 종류(type)별로 버전을 쌓고, **publishedAt 이 가장 최근인 것이 현재 버전**이다
 * (동률이면 나중에 등록된 것). 어드민이 쓰고 누구나 읽는다. 본문은 마크다운.
 */

export interface PolicyInput {
  type: PolicyType;
  version: string;
  publishedAt: Date;
  body: string;
}

/** 종류별 현재(최신) 버전 하나 — 없으면 null */
export function getCurrent(prisma: PrismaClient, type: PolicyType) {
  return prisma.policyDocument.findFirst({
    where: { type },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
  });
}

/** 종류별 개정 이력 — 최신순. 목록에는 본문을 싣지 않는다 */
export function listHistory(prisma: PrismaClient, type: PolicyType) {
  return prisma.policyDocument.findMany({
    where: { type },
    orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
    select: { id: true, version: true, publishedAt: true },
  });
}

/** 특정 버전 하나 (이력에서 클릭) */
export async function getById(prisma: PrismaClient, id: number) {
  const doc = await prisma.policyDocument.findUnique({ where: { id } });
  if (!doc) throw new ServiceError('NOT_FOUND', '약관을 찾을 수 없습니다.');
  return doc;
}

/* ── 어드민 ── */

export function listAdmin(prisma: PrismaClient) {
  return prisma.policyDocument.findMany({
    orderBy: [{ type: 'asc' }, { publishedAt: 'desc' }, { id: 'desc' }],
  });
}

export function create(prisma: PrismaClient, input: PolicyInput) {
  return prisma.policyDocument.create({ data: input });
}

export function update(prisma: PrismaClient, id: number, input: PolicyInput) {
  return prisma.policyDocument.update({ where: { id }, data: input });
}

export function remove(prisma: PrismaClient, id: number) {
  return prisma.policyDocument.delete({ where: { id } });
}
