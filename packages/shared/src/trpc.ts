import type { PrismaClient } from '@prisma/client';
import { initTRPC, TRPCError } from '@trpc/server';

import { isServiceError, ServiceErrorCode } from './services/errors';

/**
 * applicant — 치지직 OAuth 는 통과했지만 화이트리스트에 없는 채널 (#96).
 * id 는 SignupApplication.id 다. 신청 상태 조회·사유 제출만 할 수 있다.
 */
export type UserRole = 'streamer' | 'admin' | 'applicant';

export interface AuthUser {
  id: number;
  role: UserRole;
}

/**
 * tRPC 컨텍스트. API 서버의 createContext에서 채운다.
 * - user: 세션 JWT(session-token)에서 검증된 사용자. 없으면 null
 * - internal: 내부 서비스(챗봇 워커)가 INTERNAL_API_TOKEN으로 호출한 요청인지
 */
/** 노래 송출 소스(OBS 페이지·Electron 앱) 인증 결과 (#5 2단계) */
export interface SongSourceAuth {
  userId: number;
  /** 읽기 전용(자막 오버레이)인지 */
  readOnly: boolean;
}

/**
 * 어드민 대행 (#71) — 어드민 세션이 `admin-acting-as` 쿠키(또는 x-acting-as 헤더)로 스트리머를 지정한 상태.
 * API 의 createContext 가 admin 세션일 때만 채운다. streamerProcedure 는 이걸 보고 ctx.user 를 그 스트리머로 좁힌다.
 */
export interface ActingAs {
  /** 대행 대상 스트리머 */
  userId: number;
  /** 실제 세션의 어드민 (감사 로그용, #175) */
  adminId: number;
}

export interface Context {
  prisma: PrismaClient;
  user: AuthUser | null;
  internal: boolean;
  /** x-song-token 헤더로 인증된 송출 소스. 없으면 null */
  songSource: SongSourceAuth | null;
  /** 어드민 대행 상태. 없으면 null (#71) */
  actingAs?: ActingAs | null;
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

/**
 * 로그인한 스트리머 전용. ctx.user가 non-null로 좁혀진다.
 * 어드민이 대행 중(#71)이면 ctx.user 를 대행 대상 스트리머로 바꿔 통과시킨다 — 89개 스트리머 프로시저가
 * 수정 없이 그 스트리머 스코프로 동작한다. 실제 세션이 admin 일 때만 가능하므로 스트리머가 쿠키를 흉내내도 소용없다.
 */
export const streamerProcedure = publicProcedure.use(({ ctx, next }) => {
  if (ctx.user?.role === 'streamer') {
    return next({ ctx: { ...ctx, user: ctx.user } });
  }
  if (ctx.user?.role === 'admin' && ctx.actingAs) {
    const user: AuthUser = { id: ctx.actingAs.userId, role: 'streamer' };
    return next({ ctx: { ...ctx, user } });
  }
  throw new TRPCError({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
});

/** 사용 신청자 전용 (#96) — ctx.user.id 가 신청 레코드 id */
export const applicantProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.user || ctx.user.role !== 'applicant') {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '치지직 로그인이 필요합니다.' });
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

/**
 * 노래 송출 소스 전용 (OBS 재생 페이지 등). 토큰 권한은 상태 구독 + 재생 보고로 제한된다 —
 * 큐 삭제 같은 조작은 할 수 없다 (토큰이 URL 에 노출되기 때문, #5)
 */
export const songSourceProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.songSource || ctx.songSource.readOnly) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '유효하지 않은 송출 소스 토큰입니다.' });
  }
  return next({ ctx: { ...ctx, songSource: ctx.songSource } });
});

/** 내부 서비스(챗봇 워커) 전용 — INTERNAL_API_TOKEN 헤더 필요 */
export const internalProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.internal) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: '내부 서비스 전용 API입니다.' });
  }
  return next();
});
