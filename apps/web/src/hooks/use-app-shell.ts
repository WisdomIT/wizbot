'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 데스크톱 앱(#85) 안에서 열렸는지, 그리고 창 모드를 바꾸는 통로.
 * 앱의 preload 가 `window.wizbotApp` 을 심는다 — 웹 브라우저에는 없다.
 */
export type WindowMode = 'mini' | 'desktop';

interface WizbotApp {
  platform: string;
  setMode: (mode: WindowMode, queueOpen: boolean) => void;
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
  const [mode, setModeState] = useState<WindowMode>('mini');
  const [queueOpen, setQueueOpenState] = useState(false);

  useEffect(() => {
    const app = window.wizbotApp;
    if (!app) return;

    const savedMode = localStorage.getItem(MODE_KEY);
    const savedQueue = localStorage.getItem(QUEUE_KEY);
    const nextMode: WindowMode = savedMode === 'desktop' ? 'desktop' : 'mini';
    const nextQueue = savedQueue === '1';

    setBridge(app);
    setModeState(nextMode);
    setQueueOpenState(nextQueue);
    app.setMode(nextMode, nextQueue);
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

  return {
    /** 앱 안에서 열렸는가 — 웹 브라우저면 false */
    isApp: bridge !== null,
    platform: bridge?.platform ?? '',
    mode: bridge ? mode : ('desktop' as WindowMode),
    setMode,
    queueOpen,
    setQueueOpen,
  };
}
