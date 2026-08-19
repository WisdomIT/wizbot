'use client';

import { Bot } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { adminLoginCheck } from './actions';

/**
 * 관리자 매직 링크 착지 페이지.
 * GET 시점에는 아무 부수효과도 없고, 버튼을 눌러야 패스코드가 검증·소모된다
 * (메일 스캐너/브라우저 프리페치가 일회용 코드를 소모하는 것 방지).
 */
function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const email = searchParams.get('email') ?? '';
  const code = searchParams.get('code') ?? '';
  const valid = Boolean(email && code);

  async function handleConfirm() {
    if (loading) return;
    setLoading(true);
    try {
      const result = await adminLoginCheck(email, code);
      if (result.ok) {
        router.replace('/admin');
      } else {
        toast.error(result.message);
        router.replace(`/login?error=${encodeURIComponent(result.message)}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <Bot className="size-4" />
          </div>
          위즈봇
        </div>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">관리자 로그인</CardTitle>
            <CardDescription>
              {valid ? `${email} 계정으로 로그인합니다.` : '유효하지 않은 로그인 링크입니다.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={handleConfirm} disabled={!valid || loading}>
              {loading ? '확인 중...' : '로그인'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SuspensePage() {
  return (
    <Suspense>
      <AdminLoginPage />
    </Suspense>
  );
}
