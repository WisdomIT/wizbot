import { redirect } from 'next/navigation';

import { getMe } from '@/app/_lib/me';

import { CafeEditor } from './_components/cafe-editor';

/** 카페 대문 이미지 에디터 (#9 PR2) */
export default async function Page() {
  const me = await getMe();
  if (!me) redirect('/login');
  return <CafeEditor channelId={me.channelId} />;
}
