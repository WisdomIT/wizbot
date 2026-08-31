import { readFileSync } from 'node:fs';

import { app, BrowserWindow, ipcMain } from 'electron';

import { appIconPath } from './icons';
import { getUpdateState, type UpdateState } from './updater';

/**
 * 「앱 정보」 창 (#117) — macOS 의 「이 Mac에 관하여」처럼 아이콘·이름·버전을 보여주고,
 * 새 버전이 있으면 하단에 설치 버튼을 띄운다. 원격 사이트와 무관하게 떠야 하므로(오프라인·로그인 전)
 * 로컬 data URL 로 그린다. 아이콘도 file:// 을 못 읽는 data 문서라 base64 로 심는다.
 */
let aboutWindow: BrowserWindow | null = null;

function iconDataUrl(): string | null {
  const path = appIconPath();
  if (!path) return null;
  try {
    return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
  } catch {
    return null;
  }
}

function aboutHtml(): string {
  const icon = iconDataUrl();
  const update = getUpdateState();
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>앱 정보</title><style>
    :root { color-scheme: light dark; }
    body { margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; height: 100vh; font-family: -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif;
      background: light-dark(#fafafa, #171717); color: light-dark(#171717, #fafafa); user-select: none; }
    img { width: 96px; height: 96px; }
    h1 { margin: 8px 0 0; font-size: 18px; }
    p { margin: 0; font-size: 13px; color: light-dark(#666, #999); }
    button { margin-top: 16px; padding: 8px 16px; font-size: 13px; border: none; border-radius: 8px;
      background: #2563eb; color: #fff; cursor: pointer; display: none; }
    button:hover { background: #1d4ed8; }
  </style></head><body>
    ${icon ? `<img src="${icon}" alt="">` : ''}
    <h1>wizbot player</h1>
    <p id="version">버전 ${app.getVersion()}</p>
    <button id="update"></button>
    <script>
      const button = document.getElementById('update');
      function render(state) {
        if (state) {
          button.textContent = '새 버전 (' + state.version + ') 설치';
          button.style.display = 'block';
        } else {
          button.style.display = 'none';
        }
      }
      render(${JSON.stringify(update)});
      button.addEventListener('click', () => window.wizbotApp?.applyUpdate());
      window.wizbotApp?.onUpdateChanged?.(render);
    </script>
  </body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function openAboutWindow(preloadPath: string) {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }
  aboutWindow = new BrowserWindow({
    width: 300,
    height: 340,
    title: '앱 정보',
    icon: appIconPath(),
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: preloadPath },
  });
  void aboutWindow.loadURL(aboutHtml());
  aboutWindow.on('closed', () => {
    aboutWindow = null;
  });
}

/** 업데이트 상태가 바뀌면 열려 있는 정보 창에도 알린다 */
export function notifyAboutWindow(state: UpdateState) {
  aboutWindow?.webContents.send('app:update-changed', state);
}

/** 웹뷰의 조회 요청 — 창 생성 전에 등록해 둔다 */
export function registerAboutIpc() {
  ipcMain.handle('app:get-update', () => getUpdateState());
}
