/** 앱이 로드할 사이트. 개발 중에는 WIZBOT_SITE_URL 로 로컬을 가리킨다 */
export const SITE_URL = (process.env.WIZBOT_SITE_URL ?? 'https://bot.wisdomit.co.kr').replace(
  /\/$/,
  '',
);

/** 앱 메인 창 — 콘솔과 같은 뮤직플레이어 화면 */
export const PLAYER_URL = `${SITE_URL}/app/player`;

/** 숨은 재생 창 — 소리를 담당한다 */
export const SOURCE_URL = `${SITE_URL}/app/source`;

/**
 * 숨은 창 크기.
 * 유튜브는 플레이어 크기로 화질 등급을 고르고 오디오 트랙도 그 등급을 따라간다.
 * 너무 작게 잡으면 저비트레이트 오디오가 선택되므로 실제 크기를 준다 (#5).
 */
export const SOURCE_WINDOW_SIZE = { width: 960, height: 600 };

/** 트레이 툴팁·단축키 상태를 갱신하는 주기 */
export const POLL_MS = 10_000;
