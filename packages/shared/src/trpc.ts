import type { PrismaClient } from '@prisma/client';
import { initTRPC, TRPCError } from '@trpc/server';

import { isServiceError, ServiceErrorCode } from './services/errors';

export type UserRole = 'streamer' | 'admin';

export interface AuthUser {
  id: number;
  role: UserRole;
}

/**
 * tRPC 컨텍스트. API 서버의 createContext에서 채운다.
 * - user: 세션 JWT(session-token)에서 검증된 사용자. 없으면 null
 * - internal: 내부 서비스(챗봇 워커)가 INTERNAL_API_TOKEN으로 호출한 요청인지
 */
export interface Context {
  prisma: PrismaClient;
  user: AuthUser | null;
  internal: boolean;
}

export const t = initTRPC.context<Context>().create();

const SERVICE_ERROR_CODE_MAP: Record<ServiceErrorCode, TRPCError['code']> = {
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_INPUT: 'BAD_REQUEST',
  FORBIDDEN: 'FORBIDDEN',
};

/**
 * 서비스 계층의 ServiceError를 TRPCError로 변환 (메시지 유지).
 * tRPC v11의 next()는 throw 하지 않고 { ok:false, error } 를 반환하며,
 * 원본 예외는 error.cause 에 담긴다.
 */
const mapServiceErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok && isServiceError(result.error.cause)) {
    const cause = result.error.cause;
    throw new TRPCError({
      code: SERVICE_ERROR_CODE_MAP[cause.code],
      message: cause.message,
      cause,
    });
  }
  return result;
});

/** 인증 불필요 (공개 조회, 로그인 플로우, 설정값) */
export const publicProcedure = t.procedure.use(mapServiceErrors);

/** 로그인한 스트리머 전용. ctx.user가 non-null로 좁혀진다 */
export const streamerProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'streamer') {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** 관리자 전용 */
export const adminProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '관리자 권한이 필요합니다.' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** 내부 서비스(챗봇 워커) 전용 — INTERNAL_API_TOKEN 헤더 필요 */
export const internalProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.internal) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '내부 서비스 전용 API입니다.' });
  }
  return next();
});
