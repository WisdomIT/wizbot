/* eslint-disable no-console */
// middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getPublicSiteUrl } from './app/login/_apis/chzzk';
import { signJwt, verifyJwt } from './lib/jwt'; // JOSE 기반으로 변환된 버전 사용

const ONE_DAY_SECONDS = 60 * 60 * 24;
const loginError = '로그인 후 이용해주세요.';

export async function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-url', request.url);

  const { pathname } = request.nextUrl;

  // 경로가 /admin 또는 /streamer로 시작할 경우만 인증 로직 실행
  if (pathname.startsWith('/admin') || pathname.startsWith('/streamer')) {
    const token = request.cookies.get('session-token')?.value;
    const publicSiteUrl = await getPublicSiteUrl();
    const errorUrl = `${publicSiteUrl}/login?error=${loginError}`;

    if (!token) {
      return NextResponse.redirect(errorUrl);
    }

    try {
      const payload = await verifyJwt(token);
      const now = Math.floor(Date.now() / 1000);
      const issuedAt = payload.iat ?? 0;

      const response = NextResponse.next({
        request: { headers: requestHeaders },
      });

      // 1일이 지난 경우 새 토큰 발급
      if (now - issuedAt > ONE_DAY_SECONDS) {
        const newToken = await signJwt({ id: payload.id, role: payload.role });

        response.cookies.set('session-token', newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        });
      }

      if (pathname.startsWith('/admin') && payload.role !== 'admin') {
        return NextResponse.redirect(errorUrl);
      }

      if (pathname.startsWith('/streamer') && payload.role !== 'streamer') {
        return NextResponse.redirect(errorUrl);
      }

      return response;
    } catch (err) {
      console.error('JWT verification error:', err);
      return NextResponse.redirect(errorUrl);
    }
  }

  // 인증 경로가 아닌 경우에도 헤더는 항상 주입
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
