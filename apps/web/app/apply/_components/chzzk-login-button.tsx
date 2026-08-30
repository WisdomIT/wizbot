'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/**
 * /login/chzzk 는 페이지가 아니라 OAuth 로 리다이렉트하는 라우트 핸들러다.
 * <Link> 로 가면 클라이언트 라우터가 RSC 페이로드를 기대해 깨진다 — loginForm 과 같은 방식으로 이동한다.
 */
export function ChzzkLoginButton({ children }: { children: ReactNode }) {
  return (
    <Button className="w-full" onClick={() => (window.location.href = '/login/chzzk')}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" className="size-4">
        <path
          d="M7.27077 2L3.97708 6.76349H7.96418L3 14H13.543V10.8963H9.08309L14 3.75934H9.99713L11.2106 2H7.27077Z"
          fill="currentColor"
        />
      </svg>
      {children}
    </Button>
  );
}
