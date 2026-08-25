import { app } from 'electron';
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
 */

/** 첫 확인은 창이 뜬 뒤 여유를 두고 (기동 직후 네트워크가 안 잡힐 수 있다) */
const FIRST_CHECK_MS = 10_000;
/** 이후 주기적 확인 — 6시간 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let downloaded = false;
let timer: NodeJS.Timeout | null = null;

/** 받아둔 업데이트가 있어 재시작만 하면 되는 상태인가 */
export function isUpdateReady() {
  return downloaded;
}

/** 트레이 메뉴에서 호출 — 지금 설치하고 재시작한다 */
export function installUpdateNow() {
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
 * @param onReady 업데이트를 받아 설치 대기 상태가 되면 호출된다 (트레이 메뉴 갱신용)
 */
export function initUpdater(onReady: () => void) {
  //  개발 실행에서는 app-update.yml 이 없어 매번 실패한다
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  //  종료할 때 자동 설치되는 기본 동작은 그대로 둔다 — 트레이 메뉴는 그걸 앞당기는 수단이다
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', () => {
    downloaded = true;
    onReady();
  });
  autoUpdater.on('error', () => {
    /* 확인·다운로드 실패는 무시한다 (오프라인·릴리즈 없음 등) */
  });

  setTimeout(check, FIRST_CHECK_MS);
  timer = setInterval(check, CHECK_INTERVAL_MS);
}

export function stopUpdater() {
  if (timer) clearInterval(timer);
  timer = null;
}
