import { notFound } from 'next/navigation';

import { DataTable } from './_components/data-table';
import { fetchCommandList } from './_lib/command';

export default async function Page({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;

  //  try 안에서 JSX 를 만들면 렌더 오류가 catch 로 잡히는 것처럼 오해된다 — 데이터만 try (#200)
  let data;
  try {
    data = await fetchCommandList(channelId);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching command list:', error);
    return notFound();
  }
  return <DataTable data={data} />;
}
