'use client';

import { useEffect } from 'react';

import { getChzzkTokenInterlock } from '../_apis/chzzk';

// app/page.tsx
export default function Page({ searchParams }: { searchParams: { code: string; state: string } }) {
  const { code } = searchParams;

  const handleCode = async (code: string) => {
    const chzzkToken = await getChzzkTokenInterlock(code);
    console.log('chzzkToken', chzzkToken);
  };

  useEffect(() => {
    if (code) {
      void handleCode(code);
    }
  }, [code]);

  return <div>코드: {code}</div>;
}
