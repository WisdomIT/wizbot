import { NextRequest } from 'next/server';

import { signJwt } from '@/lib/jwt';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE_PATH } from '@/lib/oauth-state';
import { redirectTo } from '@/lib/request-url';

import { getChzzkTokenInterlock } from '../_apis/chzzk';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const clearStateCookie = `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=${OAUTH_STATE_COOKIE_PATH}; Max-Age=0; SameSite=Lax${
    isProduction ? '; Secure' : ''
  }`;

  const redirectToLoginWithError = (message: string) =>
    redirectTo(`/login?error=${encodeURIComponent(message)}`, { 'Set-Cookie': clearStateCookie });

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

    // 화이트리스트에 없는 채널 — 신청 화면으로. OAuth 로 본인이 확인됐으므로 신청 레코드
    // id 를 담은 짧은 세션(1시간)을 준다. 상태 조회·사유 제출만 할 수 있는 역할이다 (#96)
    if (auth.kind === 'applicant') {
      const token = await signJwt({ id: auth.applicationId, role: 'applicant' }, '1h');
      const response = redirectTo('/apply');
      response.headers.append(
        'Set-Cookie',
        `session-token=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict${
          isProduction ? '; Secure' : ''
        }`,
      );
      response.headers.append('Set-Cookie', clearStateCookie);
      return response;
    }

    const { userId } = auth;

    const token = await signJwt({ id: userId, role: 'streamer' });

    const response = redirectTo('/login/redirect?to=/streamer');
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
