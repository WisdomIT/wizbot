'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    toast.error('권한이 없습니다');
    router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div />;
}
