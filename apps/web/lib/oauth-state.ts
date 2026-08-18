/** 치지직 OAuth 로그인 CSRF 방어용 state 쿠키 설정 (#18) */
export const OAUTH_STATE_COOKIE = 'oauth-state';
export const OAUTH_STATE_MAX_AGE = 60 * 10; // 10분
export const OAUTH_STATE_COOKIE_PATH = '/login';
