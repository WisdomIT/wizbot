import type { NotifyKind, PrismaClient } from '@prisma/client';

import { sendMail } from '../lib/nodemailer';
import { ServiceError } from './errors';

/**
 * 운영자 알림 계층 (#207). 호출부는 notifyAdmins 하나만 부르고, 메일(관리자 전원)과
 * 디스코드 웹훅(종류별 DB 등록)이 함께 나간다. 어느 채널이 실패해도 서로와 원래 동작에 영향이 없다 —
 * 알림은 최선 노력이고 재시도하지 않는다.
 */

export const NOTIFY_KIND_LABEL: Record<NotifyKind, string> = {
  SESSION_EXPIRED: '네이버 봇 세션 만료',
  SIGNUP: '사용 신청',
  CAFE_JOIN: '카페 봇 가입 요청',
  INQUIRY: '문의사항',
  ERROR: '오류 알림',
};

export interface NotifyMessage {
  /** 메일 제목([위즈봇] 접두)·디스코드 embed 제목 */
  title: string;
  /** 본문 줄들 — falsy 는 건너뛴다 */
  lines: (string | null | undefined | false)[];
  /** 처리 링크 (메일 마지막 줄 · embed 링크) */
  link?: { label: string; url: string };
}

/** 디스코드 embed description 제한(4096)보다 훨씬 짧게 — 알림은 요약이다 */
const DISCORD_MAX_DESCRIPTION = 1900;
const DISCORD_COLOR = 0x3b82f6;

/** 디스코드 웹훅 payload — 순수 함수(테스트용) */
export function buildDiscordPayload(kind: NotifyKind, message: NotifyMessage) {
  const body = message.lines.filter((line): line is string => !!line).join('\n');
  const description = body.length > DISCORD_MAX_DESCRIPTION ? `${body.slice(0, DISCORD_MAX_DESCRIPTION)}…` : body;
  return {
    username: '위즈봇',
    embeds: [
      {
        title: message.title.slice(0, 256),
        description: [description, message.link ? `\n[${message.link.label}](${message.link.url})` : ''].join(''),
        color: DISCORD_COLOR,
        footer: { text: NOTIFY_KIND_LABEL[kind] },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/** 웹훅 URL 은 비밀값 — 화면에는 끝 4자만 */
export function maskWebhookUrl(url: string): string {
  return `…${url.slice(-4)}`;
}

const DISCORD_WEBHOOK_URL = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;

type FetchLike = typeof fetch;

async function sendDiscord(prisma: PrismaClient, kind: NotifyKind, message: NotifyMessage, fetchImpl: FetchLike) {
  const webhook = await prisma.discordWebhook.findUnique({ where: { kind } });
  if (!webhook?.enabled) return false;
  const response = await fetchImpl(webhook.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildDiscordPayload(kind, message)),
  });
  if (!response.ok) throw new Error(`디스코드 응답 ${response.status}`);
  return true;
}

async function sendAdminMail(prisma: PrismaClient, message: NotifyMessage) {
  const admins = await prisma.admin.findMany({ select: { email: true } });
  if (admins.length === 0) return false;
  await sendMail({
    to: admins.map((admin) => admin.email).join(','),
    subject: `[위즈봇] ${message.title}`,
    text: [...message.lines.filter(Boolean), ...(message.link ? ['', `${message.link.label}: ${message.link.url}`] : [])].join('\n'),
  });
  return true;
}

/**
 * 운영자에게 알린다 — 메일 + 디스코드. throw 하지 않고(실패는 콘솔에만) 채널별 발송 여부를 돌려준다.
 * 호출부가 「알림이 실제로 나갔을 때만」 해야 하는 일(예: 세션 만료 alertedAt)은 반환값으로 판단한다.
 */
export async function notifyAdmins(prisma: PrismaClient, kind: NotifyKind, message: NotifyMessage, fetchImpl: FetchLike = fetch) {
  const [mail, discord] = await Promise.allSettled([sendAdminMail(prisma, message), sendDiscord(prisma, kind, message, fetchImpl)]);
  // eslint-disable-next-line no-console
  if (mail.status === 'rejected') console.error('[notify] 메일 실패:', kind, mail.reason);
  // eslint-disable-next-line no-console
  if (discord.status === 'rejected') console.error('[notify] 디스코드 실패:', kind, discord.reason);
  return {
    mailSent: mail.status === 'fulfilled' && mail.value,
    discordSent: discord.status === 'fulfilled' && discord.value,
  };
}

/* ── 어드민: 웹훅 관리 ── */

export async function listWebhooks(prisma: PrismaClient) {
  const rows = await prisma.discordWebhook.findMany();
  const byKind = new Map(rows.map((row) => [row.kind, row]));
  return (Object.keys(NOTIFY_KIND_LABEL) as NotifyKind[]).map((kind) => {
    const row = byKind.get(kind);
    return {
      kind,
      label: NOTIFY_KIND_LABEL[kind],
      configured: !!row,
      enabled: row?.enabled ?? false,
      maskedUrl: row ? maskWebhookUrl(row.url) : null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

export async function setWebhook(prisma: PrismaClient, kind: NotifyKind, input: { url: string | null; enabled: boolean }) {
  if (input.url === null) {
    await prisma.discordWebhook.deleteMany({ where: { kind } });
    return;
  }
  const url = input.url.trim();
  if (!DISCORD_WEBHOOK_URL.test(url)) {
    throw new ServiceError('INVALID_INPUT', '디스코드 웹훅 URL 형식이 아닙니다. (https://discord.com/api/webhooks/…)');
  }
  await prisma.discordWebhook.upsert({ where: { kind }, update: { url, enabled: input.enabled }, create: { kind, url, enabled: input.enabled } });
}

export async function setWebhookEnabled(prisma: PrismaClient, kind: NotifyKind, enabled: boolean) {
  const updated = await prisma.discordWebhook.updateMany({ where: { kind }, data: { enabled } });
  if (updated.count === 0) throw new ServiceError('NOT_FOUND', '먼저 웹훅 URL 을 등록해주세요.');
}

/** 등록 직후 확인용 — 실제 웹훅으로 테스트 메시지를 쏜다 (비활성이어도 보낸다) */
export async function testWebhook(prisma: PrismaClient, kind: NotifyKind, fetchImpl: FetchLike = fetch) {
  const webhook = await prisma.discordWebhook.findUnique({ where: { kind } });
  if (!webhook) throw new ServiceError('NOT_FOUND', '먼저 웹훅 URL 을 등록해주세요.');
  const response = await fetchImpl(webhook.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildDiscordPayload(kind, { title: `테스트 — ${NOTIFY_KIND_LABEL[kind]}`, lines: ['이 채널로 알림이 옵니다.'] })),
  });
  if (!response.ok) throw new ServiceError('INVALID_INPUT', `디스코드가 거부했습니다 (HTTP ${response.status}). URL 을 확인해주세요.`);
}
