'use client';

import { useEffect, useRef } from 'react';

/** SSE 이벤트 (API songEvents 와 동일 형태) */
export type SongEvent =
  | { type: 'connected' }
  | { type: 'playback' }
  | { type: 'queue' }
  /** 송출 소스가 광고로 추정되는 재생을 감지/해제함 */
  | { type: 'ad'; active: boolean }
  | {
      type: 'command';
      action: 'play' | 'pause' | 'stop' | 'next' | 'seek' | 'volume';
      value?: number;
    }
  | { type: 'source' };

/**
 * 재생 이벤트 구독 (#5 2단계).
 * token 을 주면 송출 소스(OBS 페이지)로, 없으면 세션 쿠키로 스트리머 컨트롤러로 붙는다.
 * EventSource 는 연결이 끊기면 자동 재연결한다.
 */
export function useSongEvents(onEvent: (event: SongEvent) => void, token?: string) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const url = token ? `/api/song/events?token=${encodeURIComponent(token)}` : '/api/song/events';
    const source = new EventSource(url);

    source.onmessage = (message) => {
      try {
        handlerRef.current(JSON.parse(message.data) as SongEvent);
      } catch {
        // 형식이 깨진 이벤트는 무시한다
      }
    };

    return () => source.close();
  }, [token]);
}
