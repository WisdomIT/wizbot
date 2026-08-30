/**
 * 세션 쿠키는 있는데 쓸 수 없을 때(서명 무효·만료·사용자 없음) 보낼 곳 (#185).
 *
 * 로그아웃 라우트를 거쳐 **쿠키를 지운 뒤** 로그인 페이지로 간다. 지우지 않으면
 * 레이아웃(me 없음 → /login) ↔ 로그인 페이지(JWT 유효 → /streamer) 가 무한히 오간다 —
 * 환경 분리(#124) 뒤 옛 쿠키를 가진 앱이 검정 화면만 보이던 원인.
 */
export const SESSION_EXPIRED_MESSAGE = '세션이 만료되었습니다. 다시 로그인해주세요.';

export const SESSION_EXPIRED_REDIRECT = `/login/logout?to=/login&error=${encodeURIComponent(SESSION_EXPIRED_MESSAGE)}`;
