'use client';

import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';

/** /login/logout 은 라우트 핸들러라 <Link> 대신 전체 내비게이션으로 (chzzk-login-button 과 같은 이유) */
export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="self-center text-muted-foreground"
      onClick={() => (window.location.href = '/login/logout')}
    >
      <LogOut />
      다른 계정으로 로그인
    </Button>
  );
}
