import type { PrismaClient } from '@prisma/client';

import { ServiceError } from './errors';

/**
 * 스트리머 바로가기 링크 (#7 A2).
 * 여기 등록한 링크가 랜딩 카드·/list·시청자 사이드바에 노출된다.
 */

const MAX_SHORTCUTS = 12;

/** 시청자에게 그대로 노출되는 링크라 http(s) 만 허용한다 (javascript: 등 차단) */
function assertSafeUrl(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ServiceError(
      'INVALID_INPUT',
      'URL 형식이 올바르지 않습니다. (예: https://example.com)',
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ServiceError('INVALID_INPUT', 'http(s):// 로 시작하는 주소만 등록할 수 있습니다.');
  }
}

function assertName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new ServiceError('INVALID_INPUT', '이름을 입력해주세요.');
  if (trimmed.length > 20) throw new ServiceError('INVALID_INPUT', '이름은 20자 이하여야 합니다.');
  return trimmed;
}

/** 아이콘은 웹의 피커가 유효한 이름만 넘긴다. 서버는 형식만 검증(미지의 이름은 렌더 시 폴백) */
function assertIcon(icon: string) {
  if (!/^[A-Za-z0-9]{1,40}$/.test(icon)) {
    throw new ServiceError('INVALID_INPUT', '아이콘 이름이 올바르지 않습니다.');
  }
  return icon;
}

export function listShortcuts(prisma: PrismaClient, userId: number) {
  return prisma.userShortcut.findMany({ where: { userId }, orderBy: { order: 'asc' } });
}

async function getOwned(prisma: PrismaClient, userId: number, id: number) {
  const shortcut = await prisma.userShortcut.findFirst({ where: { id, userId } });
  if (!shortcut) throw new ServiceError('NOT_FOUND', '존재하지 않는 링크입니다.');
  return shortcut;
}

export async function createShortcut(
  prisma: PrismaClient,
  input: { userId: number; name: string; url: string; icon: string },
) {
  const name = assertName(input.name);
  assertSafeUrl(input.url);
  const icon = assertIcon(input.icon);

  const count = await prisma.userShortcut.count({ where: { userId: input.userId } });
  if (count >= MAX_SHORTCUTS) {
    throw new ServiceError('CONFLICT', `링크는 최대 ${MAX_SHORTCUTS}개까지 등록할 수 있습니다.`);
  }

  const last = await prisma.userShortcut.findFirst({
    where: { userId: input.userId },
    orderBy: { order: 'desc' },
    select: { order: true },
  });

  return prisma.userShortcut.create({
    data: {
      userId: input.userId,
      name,
      url: input.url,
      icon,
      order: (last?.order ?? 0) + 1,
    },
  });
}

export async function updateShortcut(
  prisma: PrismaClient,
  input: { userId: number; id: number; name: string; url: string; icon: string },
) {
  const name = assertName(input.name);
  assertSafeUrl(input.url);
  const icon = assertIcon(input.icon);

  const existing = await getOwned(prisma, input.userId, input.id);

  return prisma.userShortcut.update({
    where: { id: existing.id },
    data: { name, url: input.url, icon },
  });
}

export async function deleteShortcut(prisma: PrismaClient, userId: number, id: number) {
  const existing = await getOwned(prisma, userId, id);
  return prisma.userShortcut.delete({ where: { id: existing.id } });
}

/**
 * 순서 이동 — 인접 항목과 order 를 교체한다.
 * 경계(맨 위에서 up, 맨 아래에서 down)면 아무것도 하지 않는다.
 */
export async function moveShortcut(
  prisma: PrismaClient,
  userId: number,
  id: number,
  direction: 'up' | 'down',
) {
  const current = await getOwned(prisma, userId, id);

  const neighbor = await prisma.userShortcut.findFirst({
    where:
      direction === 'up'
        ? { userId, order: { lt: current.order } }
        : { userId, order: { gt: current.order } },
    orderBy: { order: direction === 'up' ? 'desc' : 'asc' },
  });
  if (!neighbor) return { moved: false as const };

  await prisma.$transaction([
    prisma.userShortcut.update({ where: { id: current.id }, data: { order: neighbor.order } }),
    prisma.userShortcut.update({ where: { id: neighbor.id }, data: { order: current.order } }),
  ]);

  return { moved: true as const };
}
