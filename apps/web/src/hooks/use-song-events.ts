'use client';

import { useEffect, useRef, useState } from 'react';

/** SSE 이벤트 (API songEvents 와 동일 형태) */
export type SongEvent =
  | { type: 'connected' }
  | { type: 'playback' }
  | { type: 'queue' }
  | {
      type: 'command';
      action: 'play' | 'pause' | 'stop' | 'next' | 'seek' | 'volume';
      value?: number;
    }
  | { type: 'source' };

/** 재연결 백오프 — 1초부터 2배씩, 최대 30초 (#319) */
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * 재생 이벤트 구독 (#5 2단계).
 * token 을 주면 송출 소스(OBS 페이지)로, 없으면 세션 쿠키로 스트리머 컨트롤러로 붙는다.
 *
 * **브라우저 EventSource 는 스스로 다 붙이지 못한다** (#319). 서버가 연결을 닫으면 재연결하지만, 응답이 401/5xx 로 끝나면
 * (API 재시작 중 프록시가 502 를 주는 경우) `readyState === CLOSED` 로 영구 포기한다. 그래서 앱은 업데이트 뒤
 * 하트비트·폴링으로만 동작해 조작 반응이 수 초 늦었다. 여기서 CLOSED 를 보면 지수 백오프로 새 EventSource 를 만들고,
 * 창이 다시 보일 때·네트워크가 돌아올 때는 바로 다시 붙인다. 붙으면 서버가 `connected` 를 보내므로 구독자는 그때 전체를 다시 읽는다.
 *
 * @returns connected — 실시간 연결이 살아 있는지 (헤더 표시용)
 */
export function useSongEvents(onEvent: (event: SongEvent) => void, token?: string) {
  const handlerRef = useRef(onEvent);
  const [connected, setConnected] = useState(false);
  //  렌더 중 ref 쓰기 금지 (#200) — 이벤트는 비동기로만 오므로 effect 시점 대입으로 충분하다
  useEffect(() => {
    handlerRef.current = onEvent;
  });

  const url = token ? `/api/song/events?token=${encodeURIComponent(token)}` : '/api/song/events';

  useEffect(() => {
    const state = { source: null as EventSource | null, timer: null as ReturnType<typeof setTimeout> | null, delay: RECONNECT_MIN_MS, disposed: false };

    const connect = () => {
      if (state.disposed) return;
      state.source?.close();
      const source = new EventSource(url);
      state.source = source;

      source.onopen = () => {
        state.delay = RECONNECT_MIN_MS;
        setConnected(true);
      };
      source.onmessage = (message) => {
        try {
          handlerRef.current(JSON.parse(message.data) as SongEvent);
        } catch {
          // 형식이 깨진 이벤트는 무시한다
        }
      };
      source.onerror = () => {
        setConnected(false);
        //  CONNECTING 이면 브라우저가 스스로 재시도 중 — 그대로 둔다. CLOSED 만 우리가 살린다
        if (source.readyState !== EventSource.CLOSED || state.disposed) return;
        if (state.timer) clearTimeout(state.timer);
        state.timer = setTimeout(() => {
          state.timer = null;
          connect();
        }, state.delay);
        state.delay = Math.min(RECONNECT_MAX_MS, state.delay * 2);
      };
    };

    //  잠자기에서 깨어나거나 네트워크가 돌아오면 백오프를 기다리지 않고 바로 붙인다
    const retryNow = () => {
      if (state.source && state.source.readyState !== EventSource.CLOSED) return;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.delay = RECONNECT_MIN_MS;
      connect();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') retryNow();
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', retryNow);

    return () => {
      state.disposed = true;
      if (state.timer) clearTimeout(state.timer);
      state.source?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', retryNow);
    };
  }, [url]);

  return { connected };
}
