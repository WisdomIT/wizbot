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
 * 앱 창을 플레이어 화면으로 되돌려야 하는지.
 *
 * 웹은 로그인을 마치면 콘솔(/streamer)로 보낸다. 앱에서는 그게 아니라 플레이어가 떠야 한다.
 * 콘솔이 잠깐 보였다 사라지지 않도록 `/login/redirect` 단계에서 미리 가로챈다.
 */
export function shouldReturnToPlayer(url: string): boolean {
  // 외부 도메인(치지직 로그인 등)은 건드리지 않는다
  if (!url.startsWith(SITE_URL)) return false;

  const [path, query = ''] = url.slice(SITE_URL.length).split('?');

  if (path.startsWith('/app/')) return false;

  // 로그인 흐름은 그대로 두되, 콘솔로 보내려는 순간 앱 화면으로 돌린다
  if (path === '/login/redirect') {
    const to = new URLSearchParams(query).get('to') ?? '';
    return !to.startsWith('/app/');
  }
  if (path.startsWith('/login')) return false;

  return true;
}

/**
 * 창 모드별 크기 (#85).
 * 화면 폭이 아니라 사용자가 버튼으로 모드를 고르므로, 크기는 메인 프로세스가 강제한다.
 */
export const MINI = {
  width: 380,
  /** 대기열을 닫았을 때 — 이 크기로 고정한다 */
  height: 176,
  /** 대기열을 열었을 때 세로 하한 */
  minHeightWithQueue: 300,
};

export const DESKTOP = {
  width: 1100,
  height: 760,
  minWidth: 760,
  minHeight: 520,
};

/**
 * 숨은 창 크기.
 * 유튜브는 플레이어 크기로 화질 등급을 고르고 오디오 트랙도 그 등급을 따라간다.
 * 너무 작게 잡으면 저비트레이트 오디오가 선택되므로 실제 크기를 준다 (#5).
 */
export const SOURCE_WINDOW_SIZE = { width: 960, height: 600 };

/** 트레이 툴팁·단축키 상태를 갱신하는 주기 */
export const POLL_MS = 10_000;
