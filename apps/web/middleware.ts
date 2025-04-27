/* eslint-disable no-console */
// /middleware.ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { signJwt, verifyJwt } from './lib/jwt'; // JOSE 기반으로 변환된 버전 사용

const ONE_DAY_SECONDS = 60 * 60 * 24;

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('session-token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = await verifyJwt(token);

    const now = Math.floor(Date.now() / 1000); // 현재 시각 (초 단위)
    const issuedAt = payload.iat ?? 0;

    let response = NextResponse.next();

    // 1일 넘었으면 토큰 재발급
    if (now - issuedAt > ONE_DAY_SECONDS) {
      const newToken = await signJwt({ id: payload.id, role: payload.role });

      response.cookies.set('session-token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7일
      });
    }

    const { pathname } = request.nextUrl;

    if (pathname.startsWith('/admin') && payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    if (pathname.startsWith('/streamer') && payload.role !== 'streamer') {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    return response;
  } catch (err) {
    console.error('JWT verification error:', err);
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/admin/:path*', '/streamer/:path*'],
};
