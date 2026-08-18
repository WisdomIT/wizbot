import { NextResponse } from 'next/server';

import { OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_PATH, OAUTH_STATE_MAX_AGE } from '@/lib/oauth-state';

import { getChzzkId, getChzzkRedirectUrl, getPublicSiteUrl } from '../_apis/chzzk';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 치지직 OAuth 로그인 시작.
 * 요청마다 랜덤 state를 생성해 httpOnly 쿠키에 저장하고, 인가 페이지로 리다이렉트한다.
 * 콜백(/login/auth)에서 쿠키의 state와 쿼리의 state를 비교해 로그인 CSRF를 방어한다.
 */
export async function GET() {
  const [chzzkId, redirectUri, publicSiteUrl] = await Promise.all([
    getChzzkId(),
    getChzzkRedirectUrl(),
    getPublicSiteUrl(),
  ]);

  if (!chzzkId || !redirectUri) {
    return NextResponse.redirect(`${publicSiteUrl}/login?error=치지직 로그인 설정이 없습니다.`);
  }

  const state = crypto.randomUUID();

  const authorizeUrl = new URL('https://chzzk.naver.com/account-interlock');
  authorizeUrl.searchParams.set('clientId', chzzkId);
  authorizeUrl.searchParams.set('redirectUri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction,
    // 외부(치지직)에서 돌아오는 top-level GET 네비게이션에서도 전송돼야 하므로 Strict가 아닌 Lax
    sameSite: 'lax',
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: OAUTH_STATE_MAX_AGE,
  });

  return response;
}
