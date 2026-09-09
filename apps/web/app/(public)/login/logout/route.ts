import { redirectTo } from '@/lib/request-url';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 세션 쿠키를 지운다. 기본은 첫 화면으로, `to`(사이트 내 경로만)와 `error`(안내 문구)를 받으면
 * 그리로 — 세션이 만료된 쿠키를 지우고 로그인 페이지로 보내는 데 쓴다 (#185).
 */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const to = searchParams.get('to') ?? '/';
  const error = searchParams.get('error');
  //  열린 리다이렉트 방지 — 사이트 내 절대 경로만
  const safeTo = to.startsWith('/') && !to.startsWith('//') ? to : '/';
  const target = error ? `${safeTo}${safeTo.includes('?') ? '&' : '?'}error=${encodeURIComponent(error)}` : safeTo;
  return redirectTo(target, {
    'Set-Cookie': `session-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${isProduction ? '; Secure' : ''}`,
  });
}
