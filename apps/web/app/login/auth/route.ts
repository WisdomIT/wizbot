import { NextRequest, NextResponse } from 'next/server';

import { signJwt } from '@/lib/jwt';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_PATH } from '@/lib/oauth-state';

import { getChzzkTokenInterlock, getPublicSiteUrl } from '../_apis/chzzk';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const publicSiteUrl = await getPublicSiteUrl();

  const clearStateCookie = `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=${OAUTH_STATE_COOKIE_PATH}; Max-Age=0; SameSite=Lax${
    isProduction ? '; Secure' : ''
  }`;

  const redirectToLoginWithError = (message: string) =>
    NextResponse.redirect(`${publicSiteUrl}/login?error=${encodeURIComponent(message)}`, {
      headers: { 'Set-Cookie': clearStateCookie },
    });

  // 콜백 URL 직접 접근 또는 provider 오류로 파라미터가 누락된 경우
  if (!code || !state) {
    return redirectToLoginWithError('로그인 정보가 올바르지 않습니다. 다시 시도해주세요.');
  }

  // 로그인 시작(/login/chzzk) 시 발급한 state와 일치하는지 검증 (CSRF 방어)
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!expectedState || expectedState !== state) {
    return redirectToLoginWithError(
      '로그인 요청이 만료되었거나 유효하지 않습니다. 다시 시도해주세요.',
    );
  }

  try {
    const auth = await getChzzkTokenInterlock({ code, state });

    const { userId } = auth;

    const token = await signJwt({ id: userId, role: 'streamer' });

    const response = NextResponse.redirect(`${publicSiteUrl}/login/redirect?to=/streamer`);
    response.headers.append(
      'Set-Cookie',
      `session-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict${
        isProduction ? '; Secure' : ''
      }`,
    );
    response.headers.append('Set-Cookie', clearStateCookie);
    return response;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during authentication:', error);
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return redirectToLoginWithError(message);
  }
}
