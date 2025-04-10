'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

import { getChzzkTokenInterlock } from '../_apis/chzzk';

// app/page.tsx
export default function Page({ searchParams }: { searchParams: { code: string; state: string } }) {
  const { code } = searchParams;

  const handleCode = async (code: string) => {
    try {
      const auth = await getChzzkTokenInterlock(code);
      alert(`accessToken: ${auth.accessToken}\nrefreshToken: ${auth.refreshToken}`);
    } catch (error) {
      if (error instanceof Error) {
        alert(error.message);
      } else {
        alert('토큰 발행 실패');
      }
    }
  };

  useEffect(() => {
    if (code) {
      void handleCode(code);
    }
  }, [code]);

  return (
    <div>
      코드: {code}
      <Button
        onClick={() => {
          void handleCode(code);
        }}
      >
        토큰발행
      </Button>
    </div>
  );
}
