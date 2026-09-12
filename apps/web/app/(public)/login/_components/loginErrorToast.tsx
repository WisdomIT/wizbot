'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

/** ?error= 쿼리를 토스트로 표시 (로그인 실패/세션 만료 리다이렉트용) */
export function LoginErrorToast() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error');
    if (error) {
      toast.error(`오류가 발생했습니다: ${error}`);
    }
  }, [searchParams]);

  return null;
}
