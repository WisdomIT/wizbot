'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function RedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const to = searchParams.get('to') || '/';

    // 보안: to가 "/"로 시작하는 내부 경로인지 검증
    if (!to.startsWith('/')) {
      router.replace('/');
      return;
    }

    router.replace(to);
  }, [router, searchParams]);

  return (
    <div>
      <p>Redirecting...</p>
    </div>
  );
}

export default function SuspensePage() {
  return (
    <Suspense fallback={<div>Redirecting...</div>}>
      <RedirectPage />;
    </Suspense>
  );
}
