import type { NotifyKind, PrismaClient } from '@prisma/client';

import { resolveMailConfig, sendMail } from '../lib/nodemailer';
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
  /** 메일 본문 줄들(문장형) — falsy 는 건너뛴다. 디스코드에는 쓰이지 않는다 */
  lines: (string | null | undefined | false)[];
  /** 처리 링크 (메일 마지막 줄 · 디스코드 embed 제목 링크) */
  link?: { label: string; url: string };
  /** 디스코드 embed 항목(폼 형식) — falsy 는 건너뛴다. 디스코드는 문장이 아니라 이것만 보낸다 */
  fields?: ({ name: string; value: string } | null | undefined | false)[];
  /** 디스코드 embed 썸네일 (예: 채널 이미지) */
  thumbnail?: string | null;
}

const DISCORD_COLOR = 0x3b82f6;
/** 디스코드 embed field value 제한 */
const DISCORD_MAX_FIELD = 1024;

/** 디스코드 웹훅 payload — 순수 함수(테스트용). 문장형 lines 는 메일 전용이고 여기서는 fields 만 쓴다 */
export function buildDiscordPayload(kind: NotifyKind, message: NotifyMessage) {
  const fields = (message.fields ?? [])
    .filter((field): field is { name: string; value: string } => !!field && !!field.value)
    .slice(0, 25)
    .map((field) => ({
      name: field.name.slice(0, 256),
      value: field.value.length > DISCORD_MAX_FIELD ? `${field.value.slice(0, DISCORD_MAX_FIELD - 1)}…` : field.value,
      inline: false,
    }));
  return {
    username: '위즈봇',
    embeds: [
      {
        title: message.title.slice(0, 256),
        ...(message.link ? { url: message.link.url } : {}),
        fields,
        color: DISCORD_COLOR,
        footer: { text: NOTIFY_KIND_LABEL[kind] },
        timestamp: new Date().toISOString(),
        ...(message.thumbnail ? { thumbnail: { url: message.thumbnail } } : {}),
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
  await sendMail(prisma, {
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
    body: JSON.stringify(buildDiscordPayload(kind, { title: `테스트 — ${NOTIFY_KIND_LABEL[kind]}`, lines: [], fields: [{ name: '확인', value: '이 채널로 알림이 옵니다.' }] })),
  });
  if (!response.ok) throw new ServiceError('INVALID_INPUT', `디스코드가 거부했습니다 (HTTP ${response.status}). URL 을 확인해주세요.`);
}

/* ── 어드민: 메일(SMTP) 설정 (#215) ── */

/** 어드민 화면용 — 비밀번호는 값 대신 설정 여부만 내려간다 */
export async function getMailSettings(prisma: PrismaClient) {
  const config = await resolveMailConfig(prisma);
  return {
    source: config.source,
    host: config.host,
    port: config.port,
    user: config.user,
    sender: config.sender,
    hasPass: !!config.pass,
  };
}

export async function setMailSettings(
  prisma: PrismaClient,
  input: { host: string; port: number; user: string; pass: string; sender: string },
) {
  const host = input.host.trim();
  const user = input.user.trim();
  const sender = input.sender.trim();
  const pass = input.pass.trim();
  if (!host || !user || !sender) throw new ServiceError('INVALID_INPUT', '호스트·계정·보내는 주소를 모두 입력해주세요.');
  const existing = await prisma.mailSettings.findUnique({ where: { id: 1 } });
  //  비밀번호를 비워 두면 저장된 값을 유지한다 (호스트만 바꿀 때 재입력 불필요)
  const nextPass = pass || existing?.pass;
  if (!nextPass) throw new ServiceError('INVALID_INPUT', '비밀번호를 입력해주세요.');
  const data = { host, port: input.port, user, pass: nextPass, sender };
  await prisma.mailSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}

/** DB 설정 삭제 → SMTP_* 환경변수로 폴백 (잘못 저장했을 때의 탈출구) */
export async function resetMailSettings(prisma: PrismaClient) {
  await prisma.mailSettings.deleteMany({ where: { id: 1 } });
}

/** 현재 유효한 설정(DB 또는 env)으로 관리자 전원에게 테스트 메일 */
export async function testMailSettings(prisma: PrismaClient) {
  const admins = await prisma.admin.findMany({ select: { email: true } });
  if (admins.length === 0) throw new ServiceError('NOT_FOUND', '관리자 계정이 없습니다.');
  try {
    await sendMail(prisma, {
      to: admins.map((admin) => admin.email).join(','),
      subject: '[위즈봇] 메일 설정 테스트',
      text: '이 메일이 도착했다면 SMTP 설정이 올바릅니다.',
    });
  } catch (error) {
    throw new ServiceError('INVALID_INPUT', `발송 실패: ${error instanceof Error ? error.message : String(error)}`);
  }
}
