'use client';

import { Bot } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { toast } from 'sonner';

import { getCurrentUser } from './_apis/user';
import { LoginForm } from './_components/loginForm';

function LoginPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');

    if (error) {
      toast.error(`오류가 발생했습니다: ${error}`);
    }
  }, [searchParams]);

  useEffect(() => {
    async function getUser() {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        if (currentUser.role === 'admin') {
          window.location.replace('/admin');
        } else if (currentUser.role === 'streamer') {
          window.location.replace('/streamer');
        }
      }
    }

    void getUser();
  }, []);

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
    </div>
  );
}

export default function SuspensePage() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
