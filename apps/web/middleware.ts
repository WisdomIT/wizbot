/* eslint-disable no-console */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { signJwt, verifyJwt } from './lib/jwt';

const ONE_DAY_SECONDS = 60 * 60 * 24;
const loginError = '로그인 후 이용해주세요.';

/**
 * 로그인 페이지로 리다이렉트 — 요청 URL 기준 상대 경로 (env/네트워크 호출 불필요, #24).
 * 앱(#85)은 켜자마자 /app 을 여는 게 정상 흐름이라, 처음 로그인할 때 오류처럼 보이지 않게
 * 안내 문구를 붙이지 않는다.
 */
function redirectToLogin(request: NextRequest) {
  const fromApp = request.nextUrl.pathname.startsWith('/app');
  const target = fromApp ? '/login' : `/login?error=${encodeURIComponent(loginError)}`;
  return NextResponse.redirect(new URL(target, request.url));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get('session-token')?.value;
  if (!token) {
    return redirectToLogin(request);
  }

  try {
    const payload = await verifyJwt(token);

    if (pathname.startsWith('/admin') && payload.role !== 'admin') {
      return redirectToLogin(request);
    }
    // 앱(#85)이 여는 /app 도 스트리머 전용
    if (
      (pathname.startsWith('/streamer') || pathname.startsWith('/app')) &&
      payload.role !== 'streamer'
    ) {
      return redirectToLogin(request);
    }

    const response = NextResponse.next();

    // 발급 1일 경과 시 새 토큰으로 연장
    const now = Math.floor(Date.now() / 1000);
    if (now - (payload.iat ?? 0) > ONE_DAY_SECONDS) {
      const newToken = await signJwt({ id: payload.id, role: payload.role });
      response.cookies.set('session-token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (err) {
    console.error('JWT verification error:', err);
    return redirectToLogin(request);
  }
}

// 인증이 필요한 경로에서만 실행 (기존: 전 경로 실행 + x-url 헤더 주입 + 매 요청 tRPC 호출)
export const config = {
  matcher: ['/admin/:path*', '/streamer/:path*', '/app/:path*'],
};
