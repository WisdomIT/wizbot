'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

type SearchDefaults = Record<string, string>;

/**
 * 목록 화면의 필터·페이지 상태를 URL 쿼리에 둔다 (#265) — 새로고침·뒤로가기·링크 공유에 위치가 남는다.
 *
 * - `defaults` 의 키만 다룬다. 기본값과 같은 값은 URL 에서 뺀다 (깨끗한 주소).
 * - 페이지 이동은 `history: 'push'` 로 뒤로가기가 되게, 필터 변경은 replace 로 (입력마다 기록이 쌓이지 않게).
 * - `defaults` 는 모듈 상수로 넘길 것 — 렌더마다 새 객체면 state 가 매번 새로 계산된다.
 * - useSearchParams 를 쓰므로 정적 프리렌더 페이지에서는 상위에 Suspense 경계가 필요하다.
 */
export function useSearchState<T extends SearchDefaults>(defaults: T) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = useMemo(() => {
    const next: SearchDefaults = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = searchParams.get(key);
      if (value !== null) next[key] = value;
    }
    return next as T;
  }, [defaults, searchParams]);

  const set = useCallback(
    (patch: Partial<T>, options: { history?: 'push' | 'replace' } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === defaults[key]) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (options.history === 'push') router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [defaults, pathname, router, searchParams],
  );

  return [state, set] as const;
}

/** 페이지 번호 파싱 — 잘못된 값은 1페이지 */
export function pageOf(value: string): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}
