import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  shell,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';
import { join } from 'node:path';

import { api, fetchState, type PlayerState } from './api';
import {
  DESKTOP,
  MINI,
  PLAYER_URL,
  POLL_MS,
  shouldReturnToPlayer,
  SOURCE_URL,
  SOURCE_WINDOW_SIZE,
} from './config';
import { loadTrayIcon } from './icons';

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

type Mode = 'mini' | 'desktop';

let mainWindow: BrowserWindow | null = null;
let sourceWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
/** 지금 등록된 조합 — 값이 바뀌면 다시 등록한다 */
let registeredSignature = '';
/** 트레이 메뉴를 만들 때 쓰는 마지막 상태 */
let lastState: PlayerState | null = null;
/** 트레이에서 종료를 골랐을 때만 실제로 끝낸다 (창을 닫으면 숨기기만 한다) */
let quitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: DESKTOP.width,
    height: DESKTOP.height,
    title: 'wizbot player',
    backgroundColor: '#0a0a0a',
    // 자체 타이틀바를 쓴다. macOS 는 시스템 신호등 버튼을 그대로 남기고,
    // Windows 는 시스템 버튼이 어두운 사각형으로 떠 밝은 화면과 어울리지 않아 직접 그린다.
    titleBarStyle: 'hidden',
    webPreferences: {
      // 사이트를 그대로 띄우므로 렌더러에 특권을 주지 않는다 — 통로는 preload 하나뿐
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  void mainWindow.loadURL(PLAYER_URL);
  applyMode('desktop', false);

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
 * 「제한 없음」을 뜻하는 값.
 *
 * ⚠️ setMaximumSize 에 0 을 넘기면 안 된다. Windows 는 0 을 무제한으로 보지만
 * macOS 는 그대로 **최대 크기 0** 으로 받아들여, 크기를 조절하면 창이 떨리다가
 * 마우스를 떼는 순간 사라진다 (실측).
 */
const NO_LIMIT = 16_384;

/**
 * 창 모드 적용.
 * - 미니 + 대기열 닫힘: 크기 고정
 * - 미니 + 대기열 열림: 세로만 조절 (하한 있음)
 * - 큰 창: 자유롭게 조절 (하한 있음)
 */
function applyMode(mode: Mode, queueOpen: boolean) {
  const win = mainWindow;
  if (!win) return;

  // 이전 모드의 제한을 먼저 푼다
  win.setResizable(true);
  win.setMinimumSize(1, 1);
  win.setMaximumSize(NO_LIMIT, NO_LIMIT);

  if (mode === 'mini') {
    const height = queueOpen
      ? Math.max(MINI.minHeightWithQueue, win.getSize()[1])
      : MINI.height;

    // 제한을 크기보다 먼저 걸어야 한다 — 나중에 걸면 적용된 크기가 뒤늦게 잘려 화면이 튄다
    win.setMinimumSize(MINI.width, queueOpen ? MINI.minHeightWithQueue : MINI.height);
    // 가로를 하한·상한 같은 값으로 묶어 세로만 늘어나게 한다
    win.setMaximumSize(MINI.width, queueOpen ? NO_LIMIT : MINI.height);
    win.setSize(MINI.width, height);
    win.setResizable(queueOpen);
    // 미니는 크기가 묶여 있어 최대화하면 제한과 충돌한다 — 버튼 자체를 막는다
    win.setMaximizable(false);
    return;
  }

  win.setMinimumSize(DESKTOP.minWidth, DESKTOP.minHeight);
  win.setMaximizable(true);

  const [width, height] = win.getSize();
  if (width < DESKTOP.minWidth || height < DESKTOP.minHeight) {
    win.setSize(DESKTOP.width, DESKTOP.height);
    win.center();
  }
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
    // 현재 곡 줄이 곧 창 열기 버튼이다
    { label: trayTooltip(state), click: showMainWindow },
    { type: 'separator' },
    {
      label: playing ? '일시정지' : '재생',
      click: () => run(api.song.togglePlay.mutate()),
    },
    { label: '다음 곡', click: () => run(api.song.next.mutate()) },
    { label: '정지', click: () => run(api.song.stop.mutate()) },
    { type: 'separator' },
    {
      label: '재생 창 보기 (진단)',
      click: () => {
        sourceWindow?.show();
        sourceWindow?.webContents.openDevTools({ mode: 'detach' });
      },
    },
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

/**
 * 단축키가 실행하는 동작.
 *
 * 재생/일시정지는 **서버가 뒤집는다** — 여기서 방향을 정하면 폴링 사이(최대 10초)
 * 낡은 상태를 보고 같은 방향을 또 보내게 되어 눌러도 아무 일이 없는 것처럼 보인다.
 * 실행 후에는 곧바로 상태를 다시 읽어 트레이 표시와 다음 판단을 맞춘다.
 */
const ACTIONS = {
  playPause: () => run(api.song.togglePlay.mutate()),
  stop: () => run(api.song.stop.mutate()),
  next: () => run(api.song.next.mutate()),
} as const;

function run(action: Promise<unknown>) {
  void action
    .then(() => poll())
    .catch((error: unknown) => {
      // 조용히 삼키면 왜 안 되는지 알 길이 없다
      // eslint-disable-next-line no-console
      console.error('[wizbot] 단축키 동작 실패:', error);
    });
}

type Shortcuts = PlayerState['shortcuts'];

/**
 * 설정에 따라 등록·해제한다.
 * 조합은 사용자가 콘솔에서 바꿀 수 있으므로, 값이 달라지면 다시 등록한다.
 */
function syncShortcuts(enabled: boolean, shortcuts: Shortcuts) {
  const signature = enabled ? JSON.stringify(shortcuts) : '';
  if (signature === registeredSignature) return;

  globalShortcut.unregisterAll();
  registeredSignature = signature;

  if (!enabled) return;

  for (const [action, handler] of Object.entries(ACTIONS)) {
    const accelerator = shortcuts[action as keyof Shortcuts];
    if (!accelerator) continue;

    try {
      // 다른 앱이 이미 쓰고 있으면 등록에 실패한다 — 나머지는 그대로 진행한다
      globalShortcut.register(accelerator, handler);
    } catch {
      /* 형식이 잘못된 조합은 건너뛴다 */
    }
  }
}

/** 트레이 표시와 단축키 상태를 주기적으로 맞춘다 */
async function poll() {
  const state = await fetchState();
  if (!state) return;

  lastState = state;
  tray?.setToolTip(trayTooltip(state));
  tray?.setContextMenu(buildTrayMenu(state));
  syncShortcuts(state.keyboardShortcut, state.shortcuts);
}

/* ── 수명주기 ── */

// 두 번 실행되면 재생도 두 번 잡힌다 — 기존 창을 띄우고 끝낸다
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  ipcMain.on('app:set-mode', (_event, mode: Mode, queueOpen: boolean) => {
    applyMode(mode, queueOpen);
  });

  ipcMain.on('app:window', (_event, action: 'minimize' | 'toggle-maximize' | 'close') => {
    const win = mainWindow;
    if (!win) return;

    if (action === 'minimize') win.minimize();
    // 닫기는 트레이로 숨긴다 (close 핸들러가 가로챈다) — 재생은 계속돼야 한다
    else if (action === 'close') win.close();
    else if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

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
