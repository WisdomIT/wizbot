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
 * 앱 창이 머물러도 되는 경로.
 * 로그인 후 웹은 /streamer 로 보내므로, 그대로 두면 앱에 콘솔이 뜬다.
 * 그 밖으로 나가면 플레이어 화면으로 되돌린다.
 */
export function isAppPath(url: string) {
  if (!url.startsWith(SITE_URL)) return true; // 외부 도메인(치지직 로그인 등)은 건드리지 않는다
  const path = url.slice(SITE_URL.length);
  return path.startsWith('/app/') || path.startsWith('/login');
}

/** 앱 창 기본 크기 — 작게 띄우는 앱이다. 좁히면 미니 플레이어가 된다 */
export const MAIN_WINDOW = {
  width: 460,
  height: 720,
  minWidth: 320,
  minHeight: 260,
};

/**
 * 숨은 창 크기.
 * 유튜브는 플레이어 크기로 화질 등급을 고르고 오디오 트랙도 그 등급을 따라간다.
 * 너무 작게 잡으면 저비트레이트 오디오가 선택되므로 실제 크기를 준다 (#5).
 */
export const SOURCE_WINDOW_SIZE = { width: 960, height: 600 };

/** 트레이 툴팁·단축키 상태를 갱신하는 주기 */
export const POLL_MS = 10_000;
