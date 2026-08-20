import { notFound } from 'next/navigation';

import { DataTable } from './_components/data-table';
import { fetchCommandList } from './_lib/command';

export default async function Page({ params }: { params: Promise<{ nickname: string }> }) {
  const { nickname } = await params;

  try {
    const data = await fetchCommandList(decodeURIComponent(nickname));
    return <DataTable data={data} />;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching command list:', error);
    return notFound();
  }
}
