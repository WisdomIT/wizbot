import {
  app,
  BrowserWindow,
  globalShortcut,
  Menu,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';

import { api, fetchState, type PlayerState } from './api';
import { loadTrayIcon } from './icons';
import {
  MAIN_WINDOW,
  POLL_MS,
  PLAYER_URL,
  shouldReturnToPlayer,
  SOURCE_URL,
  SOURCE_WINDOW_SIZE,
} from './config';

/**
 * wizbot player (#85).
 *
 * 사이트를 그대로 로드하는 셸이다.
 * - 메인 창: /app/player — 콘솔과 같은 뮤직플레이어 화면
 * - 숨은 창: /app/source — 소리만 담당. 송출 소스를 ELECTRON 으로 등록한다
 *
 * 두 창이 같은 세션을 쓰므로 한 번 로그인하면 둘 다 인증된다.
 * 유튜브에 로그인해두면(프리미엄) 그 세션도 같은 프로필에 남아 광고 없이 재생된다.
 */

let mainWindow: BrowserWindow | null = null;
let sourceWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let shortcutsRegistered = false;
/** 트레이 메뉴를 만들 때 쓰는 마지막 상태 */
let lastState: PlayerState | null = null;
/** 트레이에서 종료를 골랐을 때만 실제로 끝낸다 (창을 닫으면 숨기기만 한다) */
let quitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    ...MAIN_WINDOW,
    title: 'wizbot player',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      // 사이트를 그대로 띄우므로 렌더러에 특권을 주지 않는다
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  void mainWindow.loadURL(PLAYER_URL);

  // 외부 링크는 기본 브라우저로 (앱 창이 엉뚱한 페이지로 새지 않게)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // 로그인을 마치면 웹은 /streamer 로 보낸다 — 앱에서는 플레이어 화면으로 되돌린다
  const keepInApp = (url: string) => {
    if (shouldReturnToPlayer(url)) void mainWindow?.loadURL(PLAYER_URL);
  };

  mainWindow.webContents.on('did-navigate', (_event, url) => keepInApp(url));
  // Next 의 클라이언트 라우팅(router.replace)은 실제 이동이 아니라 did-navigate 가 뜨지 않는다.
  // /login/redirect → /streamer 가 이 경로라 in-page 도 같이 본다.
  mainWindow.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) keepInApp(url);
  });

  mainWindow.on('close', (event) => {
    // 창을 닫아도 재생은 계속돼야 한다 — 종료는 트레이에서
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 소리를 담당하는 숨은 창.
 * show: false 로 두되 크기는 실제로 준다 — 유튜브가 플레이어 크기로 화질(과 오디오 품질)을
 * 고르기 때문이다. backgroundThrottling 을 끄지 않으면 백그라운드에서 타이머가 느려져
 * 하트비트·진행률 보고가 밀린다.
 */
function createSourceWindow() {
  sourceWindow = new BrowserWindow({
    ...SOURCE_WINDOW_SIZE,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  void sourceWindow.loadURL(SOURCE_URL);

  sourceWindow.on('closed', () => {
    sourceWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/* ── 트레이 ── */

function trayTooltip(state: PlayerState | null) {
  const playback = state?.playback;
  if (!playback?.title || playback.status === 'STOPPED') return 'wizbot player';
  const mark = playback.status === 'PAUSED' ? '⏸' : '♪';
  return `${mark} ${playback.title}`;
}

function buildTrayMenu(state: PlayerState | null) {
  const playing = state?.playback.status === 'PLAYING';

  const items: MenuItemConstructorOptions[] = [
    { label: trayTooltip(state), enabled: false },
    { type: 'separator' },
    {
      label: playing ? '일시정지' : '재생',
      click: () => void (playing ? api.song.pause.mutate() : api.song.play.mutate()).catch(noop),
    },
    { label: '다음 곡', click: () => void api.song.next.mutate().catch(noop) },
    { label: '정지', click: () => void api.song.stop.mutate().catch(noop) },
    { type: 'separator' },
    { label: '창 열기', click: showMainWindow },
    {
      label: '종료',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ];

  return Menu.buildFromTemplate(items);
}

function createTray() {
  const icon = loadTrayIcon();
  // 아이콘이 없으면 트레이를 만들지 않는다 — 빈 이미지로 만들면 macOS 에서 바로 죽는다
  if (!icon) return;

  try {
    tray = new Tray(icon);
    tray.setToolTip('wizbot player');
    tray.setContextMenu(buildTrayMenu(null));
    tray.on('click', showMainWindow);
  } catch {
    // 트레이를 못 만들어도 앱은 계속 동작해야 한다
    tray = null;
  }
}

/* ── 전역 단축키 ── */

const SHORTCUTS: Record<string, () => void> = {
  'CommandOrControl+Shift+P': () => {
    const playing = lastState?.playback.status === 'PLAYING';
    void (playing ? api.song.pause.mutate() : api.song.play.mutate()).catch(noop);
  },
  'CommandOrControl+Shift+S': () => void api.song.stop.mutate().catch(noop),
  'CommandOrControl+Shift+N': () => void api.song.next.mutate().catch(noop),
};

/** 설정(UserSetting.songKeyboardShortcut)에 따라 등록·해제한다 */
function syncShortcuts(enabled: boolean) {
  if (enabled === shortcutsRegistered) return;

  if (!enabled) {
    globalShortcut.unregisterAll();
    shortcutsRegistered = false;
    return;
  }

  for (const [accelerator, handler] of Object.entries(SHORTCUTS)) {
    // 다른 앱이 이미 쓰고 있으면 등록에 실패한다 — 나머지는 그대로 진행한다
    globalShortcut.register(accelerator, handler);
  }
  shortcutsRegistered = true;
}

function noop() {
  /* 네트워크 오류는 다음 폴링에서 회복된다 */
}

/** 트레이 표시와 단축키 상태를 주기적으로 맞춘다 */
async function poll() {
  const state = await fetchState();
  if (!state) return;

  lastState = state;
  tray?.setToolTip(trayTooltip(state));
  tray?.setContextMenu(buildTrayMenu(state));
  syncShortcuts(state.keyboardShortcut);
}

/* ── 수명주기 ── */

// 두 번 실행되면 재생도 두 번 잡힌다 — 기존 창을 띄우고 끝낸다
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  void app.whenReady().then(() => {
    createMainWindow();
    createSourceWindow();
    createTray();

    void poll();
    setInterval(() => void poll(), POLL_MS);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
      else showMainWindow();
    });
  });

  // 창을 모두 닫아도 트레이에 남아 재생을 계속한다
  app.on('window-all-closed', () => {
    /* 종료하지 않는다 */
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
