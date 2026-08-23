'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * 데스크톱 앱(#85) 안에서 열렸는지, 그리고 창 모드를 바꾸는 통로.
 * 앱의 preload 가 `window.wizbotApp` 을 심는다 — 웹 브라우저에는 없다.
 */
export type WindowMode = 'mini' | 'desktop';

interface WizbotApp {
  platform: string;
  setMode: (mode: WindowMode, queueOpen: boolean) => void;
  getAutoLaunch: () => Promise<boolean>;
  setAutoLaunch: (enabled: boolean) => void;
  openYoutubeLogin: () => void;
  getYoutubeLogin: () => Promise<boolean>;
  youtubeLogout: () => Promise<void>;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    wizbotApp?: WizbotApp;
  }
}

const MODE_KEY = 'wizbot:window-mode';
const QUEUE_KEY = 'wizbot:mini-queue';

export function useAppShell() {
  // 서버 렌더 결과와 어긋나지 않도록 첫 렌더는 항상 "웹"으로 둔다
  const [bridge, setBridge] = useState<WizbotApp | null>(null);
  const [mode, setModeState] = useState<WindowMode>('desktop');
  const [queueOpen, setQueueOpenState] = useState(false);
  /** 컴퓨터 시작 시 자동 실행 — 계정이 아니라 이 기기의 설정이라 앱에서 직접 읽는다 */
  const [autoLaunch, setAutoLaunchState] = useState(false);
  /** 유튜브(프리미엄) 로그인 여부 — 로그인은 별도 창에서 이뤄진다 (#118) */
  const [youtubeLoggedIn, setYoutubeLoggedIn] = useState(false);

  useEffect(() => {
    const app = window.wizbotApp;
    if (!app) return;

    const savedMode = localStorage.getItem(MODE_KEY);
    const savedQueue = localStorage.getItem(QUEUE_KEY);
    const nextMode: WindowMode = savedMode === 'mini' ? 'mini' : 'desktop';
    const nextQueue = savedQueue === '1';

    setBridge(app);
    setModeState(nextMode);
    setQueueOpenState(nextQueue);
    app.setMode(nextMode, nextQueue);

    void app.getAutoLaunch().then(setAutoLaunchState);
    void app.getYoutubeLogin().then(setYoutubeLoggedIn);

    // 로그인은 다른 창에서 하므로, 이 창으로 돌아왔을 때 상태를 다시 읽는다
    const refresh = () => void app.getYoutubeLogin().then(setYoutubeLoggedIn);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const setMode = useCallback(
    (next: WindowMode) => {
      setModeState(next);
      localStorage.setItem(MODE_KEY, next);
      bridge?.setMode(next, next === 'mini' && queueOpen);
    },
    [bridge, queueOpen],
  );

  const setQueueOpen = useCallback(
    (next: boolean) => {
      setQueueOpenState(next);
      localStorage.setItem(QUEUE_KEY, next ? '1' : '0');
      bridge?.setMode('mini', next);
    },
    [bridge],
  );

  const setAutoLaunch = useCallback(
    (next: boolean) => {
      setAutoLaunchState(next);
      bridge?.setAutoLaunch(next);
    },
    [bridge],
  );

  const youtube = useMemo(
    () =>
      bridge
        ? {
            loggedIn: youtubeLoggedIn,
            login: () => bridge.openYoutubeLogin(),
            logout: async () => {
              await bridge.youtubeLogout();
              setYoutubeLoggedIn(await bridge.getYoutubeLogin());
            },
          }
        : undefined,
    [bridge, youtubeLoggedIn],
  );

  return {
    /** 앱 안에서 열렸는가 — 웹 브라우저면 false */
    isApp: bridge !== null,
    autoLaunch,
    setAutoLaunch,
    youtube,
    /** 창 제어 — Windows 에서 버튼을 직접 그릴 때 쓴다 */
    windowControls: bridge
      ? {
          minimize: () => bridge.minimize(),
          toggleMaximize: () => bridge.toggleMaximize(),
          close: () => bridge.close(),
        }
      : undefined,
    platform: bridge?.platform ?? '',
    mode: bridge ? mode : ('desktop' as WindowMode),
    setMode,
    queueOpen,
    setQueueOpen,
  };
}
