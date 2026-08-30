'use client';

import { createContext, useContext } from 'react';

/**
 * 어드민 대행 여부 (#71). 대행 레이아웃이 true 로 감싼다.
 * 화면이 스트리머 콘솔과 같기 때문에, 어드민이 대신 누르면 뜻이 달라지는 버튼(로그아웃·탈퇴)만 이걸로 숨긴다.
 */
const ActingContext = createContext(false);

export function ActingProvider({ children }: { children: React.ReactNode }) {
  return <ActingContext.Provider value={true}>{children}</ActingContext.Provider>;
}

export function useActingAs(): boolean {
  return useContext(ActingContext);
}
