/* eslint-disable no-console */
import { subscribeSongEvents } from '@wizbot/shared/services';
import type { Request, Response } from 'express';
import { jwtVerify } from 'jose';

import { prisma } from './db';

/**
 * 재생 상태 SSE (#5 2단계).
 *
 * 구독 주체:
 * - 스트리머 컨트롤러 — session-token 쿠키 / Authorization 헤더
 * - 송출 소스(OBS 페이지) · 자막 오버레이 — ?token= (URL 에 실려야 해서 쿼리로 받는다)
 *
 * ⚠️ 이벤트 버스가 프로세스 인메모리이므로 API_REPLICAS=1 전제 (services/songEvents.ts 참고)
 */

const HEARTBEAT_MS = 15_000;

async function resolveUserId(req: Request): Promise<number | null> {
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  if (token) {
    const setting = await prisma.userSetting.findFirst({
      where: { OR: [{ songSourceToken: token }, { songOverlayToken: token }] },
      select: { userId: true },
    });
    return setting?.userId ?? null;
  }

  // 스트리머 세션
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return null;

  const authorization = req.headers.authorization;
  const cookieHeader = req.headers.cookie ?? '';
  const fromCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('session-token='))
    ?.slice('session-token='.length);
  const sessionToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : fromCookie;
  if (!sessionToken) return null;

  try {
    const { payload } = await jwtVerify(sessionToken, new TextEncoder().encode(jwtSecret));
    if (payload.role !== 'streamer' || typeof payload.id !== 'number') return null;
    return payload.id;
  } catch {
    return null;
  }
}

export async function songEventsHandler(req: Request, res: Response) {
  const userId = await resolveUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // 프록시(Traefik·Next)에서 버퍼링되면 이벤트가 늦게 도착한다
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: 'connected' });

  const unsubscribe = subscribeSongEvents(userId, send);
  // 프록시가 유휴 연결을 끊지 않도록 주기적으로 코멘트를 보낸다
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
