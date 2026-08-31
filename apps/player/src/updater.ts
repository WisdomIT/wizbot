import { app, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

/**
 * 자동 업데이트 (#117).
 *
 * 앱은 사이트를 로드하는 셸이라 **웹 수정은 즉시 반영되지만**, 앱 자체 수정
 * (창 동작·단축키·트레이·유튜브 로그인 등)은 업데이트 없이는 전달되지 않는다.
 * 배포를 시작하기 전에 넣어야 하는 이유다 — 나중에 붙이면 이미 설치한 사용자에게
 * 전달할 방법이 없다.
 *
 * electron-builder 의 `publish: github` 설정을 그대로 쓰므로 추가 인프라가 없다.
 * 릴리즈에 함께 올라가는 latest.yml / latest-mac.yml 을 본다.
 *
 * 프리릴리즈(v1.3.0-alpha.1 등)는 기본값 allowPrerelease: false 라 내려오지 않는다 —
 * 알파 태그를 올려도 일반 사용자에게 밀리지 않는다.
 *
 * ⚠️ macOS 는 **확인만 하고 설치하지 않는다.** Squirrel.Mac 은 새 앱이 실행 중인 앱의 서명 요구 사항을
 * 만족해야 교체하는데, 우리는 Developer ID 인증서 없이 ad-hoc 서명이라 원리상 통과할 수 없다
 * (v1.2.2 실측: "Code signature … did not pass validation"). 「설치」를 누르면 dmg 다운로드를 열어 주고,
 * 사용자가 교체 설치한다. Windows 는 서명 검증이 없어 받아둔 것을 그 자리에서 설치한다.
 */
const MANUAL_INSTALL = process.platform === 'darwin';

/**
 * 지금 설치할 수 있는 새 버전 — 트레이·웹뷰·정보 창이 같은 상태를 본다 (#117).
 * Windows 는 다운로드가 끝났을 때, macOS 는 새 버전이 확인됐을 때 생긴다.
 */
export type UpdateState = { version: string } | null;
let state: UpdateState = null;

export function getUpdateState(): UpdateState {
  return state;
}

/** 새 버전 적용 — Windows 는 설치하고 재시작, macOS 는 현재 아키텍처의 dmg 다운로드를 연다 */
export function applyUpdate() {
  if (!state) return;
  if (MANUAL_INSTALL) {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    void shell.openExternal(`https://github.com/WisdomIT/wizbot/releases/latest/download/wizbot-player-mac-${arch}.dmg`);
    return;
  }
  installUpdateNow();
}

/** 첫 확인은 창이 뜬 뒤 여유를 두고 (기동 직후 네트워크가 안 잡힐 수 있다) */
const FIRST_CHECK_MS = 10_000;
/** 이후 주기적 확인 — 6시간 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let downloaded = false;
let timer: NodeJS.Timeout | null = null;

/** Windows: 받아둔 업데이트가 있어 재시작만 하면 되는 상태인가 */
function installUpdateNow() {
  if (!downloaded) return;
  // 창을 닫아도 종료되지 않는 앱이라, quitAndInstall 이 트레이에 막히지 않도록 강제한다
  autoUpdater.quitAndInstall(false, true);
}

function check() {
  //  네트워크가 없거나 릴리즈가 아직 없을 때도 조용히 넘어간다 — 사용자에게 띄울 일이 아니다
  autoUpdater.checkForUpdates().catch(() => {
    /* 다음 주기에 다시 시도한다 */
  });
}

/**
 * @param onChange 설치 가능한 새 버전 상태가 바뀌면 호출된다 (트레이·웹뷰·정보 창 갱신용)
 */
export function initUpdater(onChange: (state: UpdateState) => void) {
  //  개발 실행에서는 app-update.yml 이 없어 매번 실패한다
  if (!app.isPackaged) return;

  //  macOS 는 받아도 설치할 수 없으므로 확인만 (위 주석)
  autoUpdater.autoDownload = !MANUAL_INSTALL;
  //  NSIS 단일 exe 라 웹 인스톨러는 쓰지 않는다 — 명시하지 않으면 매 확인마다 경고를 찍고, 다음 버전에서 기본값이 바뀐다 (Windows 실측)
  autoUpdater.disableWebInstaller = true;
  //  종료할 때 자동 설치되는 기본 동작은 그대로 둔다 — 트레이 메뉴는 그걸 앞당기는 수단이다
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    downloaded = true;
    state = { version: info.version };
    onChange(state);
  });
  autoUpdater.on('update-available', (info) => {
    //  Windows 는 다운로드가 끝난 뒤에야 설치할 수 있다 — 그때 state 가 된다
    if (!MANUAL_INSTALL) return;
    state = { version: info.version };
    onChange(state);
  });
  autoUpdater.on('update-not-available', () => {
    if (!state) return;
    state = null;
    onChange(null);
  });
  //  사용자에게 띄우진 않지만 로그엔 남긴다 — "ZIP file not provided" 같은 설정 오류를 콘솔에서 바로 알 수 있게 (#117)
  autoUpdater.on('error', (error) => {
    // eslint-disable-next-line no-console
    console.error('[wizbot] 업데이트 확인/다운로드 실패:', error instanceof Error ? error.message : error);
  });

  setTimeout(check, FIRST_CHECK_MS);
  timer = setInterval(check, CHECK_INTERVAL_MS);
}

export function stopUpdater() {
  if (timer) clearInterval(timer);
  timer = null;
}
