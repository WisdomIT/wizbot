'use client';

import { useEffect } from 'react';

/** 시청자용 읽음 표시 (#206 2/3) — 비로그인이라 localStorage 로. 사이드바가 이벤트를 듣고 점을 끈다 */
export const VIEWER_NOTICE_SEEN_KEY = 'wizbot:notice-last-seen';
export const VIEWER_NOTICE_SEEN_EVENT = 'wizbot:notice-seen';

export function NoticeSeen({ latestId }: { latestId: number }) {
  useEffect(() => {
    try {
      localStorage.setItem(VIEWER_NOTICE_SEEN_KEY, String(latestId));
      window.dispatchEvent(new Event(VIEWER_NOTICE_SEEN_EVENT));
    } catch {
      /* 저장이 막힌 브라우저면 점이 남을 뿐이다 */
    }
  }, [latestId]);
  return null;
}
