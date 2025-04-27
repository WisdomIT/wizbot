// /middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { signJwt, verifyJwt } from './lib/jwt';

const ONE_DAY_SECONDS = 60 * 60 * 24;

export function middleware(request: NextRequest) {
  const token = request.cookies.get('session-token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const payload = verifyJwt(token);

    const now = Math.floor(Date.now() / 1000); // 현재 시각 (초 단위)
    const issuedAt = payload.iat;

    let response = NextResponse.next();

    // 1일 넘었으면 토큰 재발급
    if (issuedAt && now - issuedAt > ONE_DAY_SECONDS) {
      const newToken = signJwt({ id: payload.id, role: payload.role });

      response.cookies.set('session-token', newToken, {
        httpOnly: true,
        secure: true,
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
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/admin/:path*', '/streamer/:path*'],
};
