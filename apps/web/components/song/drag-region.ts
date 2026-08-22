import type { CSSProperties } from 'react';

/**
 * 앱 창 끌기 영역 (#85).
 * `-webkit-app-region` 은 React 의 CSSProperties 에 없어 단언이 필요하다.
 */
export const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties;
export const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties;
