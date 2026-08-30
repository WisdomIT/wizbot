import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { ActingAs, AuthUser, Context } from '@wizbot/shared/trpc';
import { jwtVerify } from 'jose';

import { prisma } from './db';

const SESSION_COOKIE = 'session-token';
/** 어드민 대행 대상 (#71). 웹이 쿠키로 심고(브라우저 → 프록시), 서버 컴포넌트 클라이언트는 헤더로 넘긴다 */
const ACTING_COOKIE = 'admin-acting-as';
const ACTING_HEADER = 'x-acting-as';

// env는 dotenv.config() 이후 첫 요청 시점에 읽는다 (import 호이스팅 순서에 의존하지 않도록)
let secrets: { jwtKey: Uint8Array; internalToken: string } | null = null;

function getSecrets() {
  if (secrets) return secrets;

  const jwtSecret = process.env.JWT_SECRET;
  const internalToken = process.env.INTERNAL_API_TOKEN;
  if (!jwtSecret) throw new Error('Missing JWT_SECRET environment variable');
  if (!internalToken) throw new Error('Missing INTERNAL_API_TOKEN environment variable');

  secrets = { jwtKey: new TextEncoder().encode(jwtSecret), internalToken };
  return secrets;
}

function readCookie(req: CreateExpressContextOptions['req'], cookieName: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === cookieName) return decodeURIComponent(rest.join('=')) || null;
  }
  return null;
}

/** Authorization: Bearer <jwt> 또는 session-token 쿠키에서 세션 토큰 추출 */
function extractSessionToken(req: CreateExpressContextOptions['req']): string | null {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim() || null;
  }
  return readCookie(req, SESSION_COOKIE);
}

/**
 * 어드민 대행 (#71) — admin 세션 + 대상 지정(헤더 우선, 없으면 쿠키)이 있고 그 스트리머가 실제로 있을 때만.
 * 스트리머·비로그인 세션은 값이 있어도 무시한다.
 */
async function resolveActingAs(req: CreateExpressContextOptions['req'], user: AuthUser | null): Promise<ActingAs | null> {
  if (user?.role !== 'admin') return null;
  const header = req.headers[ACTING_HEADER];
  const raw = (Array.isArray(header) ? header[0] : header) ?? readCookie(req, ACTING_COOKIE);
  const userId = Number(raw);
  if (!raw || !Number.isInteger(userId) || userId <= 0) return null;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return target ? { userId: target.id, adminId: user.id } : null;
}

async function verifySession(token: string): Promise<AuthUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecrets().jwtKey);
    const id = payload.id;
    const role = payload.role;
    if (typeof id !== 'number') return null;
    if (role !== 'streamer' && role !== 'admin' && role !== 'applicant') return null;
    return { id, role };
  } catch {
    // 만료/위조 토큰은 비로그인으로 취급 (streamerProcedure에서 UNAUTHORIZED)
    return null;
  }
}

function isInternalRequest(req: CreateExpressContextOptions['req']): boolean {
  const header = req.headers['x-internal-token'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 && value === getSecrets().internalToken;
}

/** x-song-token 헤더로 송출 소스를 식별한다 (재생용 토큰 / 자막 오버레이용 읽기 전용 토큰) */
async function resolveSongSource(req: CreateExpressContextOptions['req']) {
  const header = req.headers['x-song-token'];
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;

  const setting = await prisma.userSetting.findFirst({
    where: { OR: [{ songSourceToken: value }, { songOverlayToken: value }] },
    select: { userId: true, songSourceToken: true },
  });
  if (!setting) return null;

  return { userId: setting.userId, readOnly: setting.songSourceToken !== value };
}

export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  const token = extractSessionToken(req);
  const [user, songSource] = await Promise.all([
    token ? verifySession(token) : Promise.resolve(null),
    resolveSongSource(req),
  ]);
  const actingAs = await resolveActingAs(req, user);

  return {
    prisma,
    user,
    internal: isInternalRequest(req),
    songSource,
    actingAs,
  };
}
