import { Bot } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { verifyJwt } from '@/lib/jwt';

import { LoginErrorToast } from './_components/loginErrorToast';
import { LoginForm } from './_components/loginForm';

/** 이미 로그인된 세션이면 콘솔로 (기존: 클라이언트에서 서버 액션 호출 + 비로그인 시 throw 로그) */
async function getSessionRole(): Promise<'admin' | 'streamer' | 'applicant' | null> {
  const token = (await cookies()).get('session-token')?.value;
  if (!token) return null;
  try {
    const payload = await verifyJwt(token);
    return payload.role;
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const role = await getSessionRole();
  if (role === 'admin') redirect('/admin');
  if (role === 'streamer') redirect('/streamer');
  if (role === 'applicant') redirect('/apply');

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <Bot className="size-4" />
          </div>
          위즈봇
        </Link>
        <LoginForm />
      </div>
      <Suspense>
        <LoginErrorToast />
      </Suspense>
    </div>
  );
}
