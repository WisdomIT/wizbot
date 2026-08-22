import { contextBridge, ipcRenderer } from 'electron';

/**
 * 앱과 사이트 사이의 유일한 통로 (#85).
 *
 * 앱은 원격 사이트를 그대로 띄우므로 렌더러에 특권을 주지 않는다.
 * 창 모드 전환에 필요한 최소한만 노출한다 — 웹은 `window.wizbotApp` 이 있는지로
 * 앱 안인지 판별한다.
 */
contextBridge.exposeInMainWorld('wizbotApp', {
  platform: process.platform,
  /** 창 모드 — 크기·리사이즈 가능 여부는 메인 프로세스가 정한다 */
  setMode: (mode: 'mini' | 'desktop', queueOpen: boolean) =>
    ipcRenderer.send('app:set-mode', mode, queueOpen),
});
