import type { PrismaClient } from '@prisma/client';
import { createTransport } from 'nodemailer';

/**
 * 메일 발송 (#215). SMTP 설정은 DB(MailSettings, 어드민 페이지) 우선이고, 행이 없으면
 * SMTP_* 환경변수로 폴백한다 — 관리자 로그인이 패스코드 메일에 의존하므로, DB 설정이
 * 잘못돼도 행을 지우면 env 로 되돌아가는 탈출구를 남긴다. 발송량이 적어 transporter 는
 * 발송 시점마다 만든다 (모듈 로드 시점 고정 설정 제거).
 */

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  sender: string;
  /** 어디서 온 설정인지 — 어드민 화면 표시용 */
  source: 'db' | 'env';
}

export async function resolveMailConfig(prisma: PrismaClient): Promise<MailConfig> {
  const row = await prisma.mailSettings.findUnique({ where: { id: 1 } });
  if (row) return { host: row.host, port: row.port, user: row.user, pass: row.pass, sender: row.sender, source: 'db' };
  return {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? '465'),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    sender: process.env.SMTP_SENDER ?? '',
    source: 'env',
  };
}

function transportFor(config: MailConfig) {
  return createTransport({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.pass },
  });
}

export async function sendMail(prisma: PrismaClient, { to, subject, text }: { to: string; subject: string; text: string }) {
  const config = await resolveMailConfig(prisma);
  return transportFor(config).sendMail({ from: `"위즈봇" <${config.sender}>`, to, subject, text });
}
