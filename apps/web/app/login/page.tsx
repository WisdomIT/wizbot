import { Bot } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { verifyJwt } from '@/lib/jwt';
import { SESSION_EXPIRED_REDIRECT } from '@/lib/session-expired';
import { trpc } from '@/src/utils/trpc';

import { LoginErrorToast } from './_components/loginErrorToast';
import { LoginForm } from './_components/loginForm';

/**
 * 이미 로그인된 세션이면 콘솔로. JWT 서명만 보지 않고 **그 역할의 사용자가 실제로 있는지** API 로 확인한다 —
 * 서명은 유효한데 사용자가 없는 쿠키(환경 분리·탈퇴 뒤 남은 것)는 'stale' 로 돌려 쿠키를 지우게 한다 (#185).
 * 확인 없이 /streamer 로 보내면 레이아웃이 다시 /login 으로 보내 무한 루프가 된다.
 */
async function getSessionRole(): Promise<'admin' | 'streamer' | 'applicant' | 'stale' | null> {
  const token = (await cookies()).get('session-token')?.value;
  if (!token) return null;
  let role: 'admin' | 'streamer' | 'applicant';
  try {
    role = (await verifyJwt(token)).role;
  } catch {
    return 'stale';
  }
  const exists = await (role === 'admin'
    ? trpc.admin.me.query()
    : role === 'streamer'
      ? trpc.user.me.query()
      : trpc.signup.me.query()
  ).then((me) => !!me).catch(() => false);
  return exists ? role : 'stale';
}

export default async function LoginPage() {
  const role = await getSessionRole();
  if (role === 'stale') redirect(SESSION_EXPIRED_REDIRECT);
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
