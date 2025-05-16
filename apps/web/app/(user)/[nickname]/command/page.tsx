import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { fetchCommandList } from './_api/command';
import { DataTable } from './_components/data-table';

export default async function Page() {
  const headerList = await headers();
  const header_url = headerList.get('x-url') || '';
  // uri 제외 후 pathname만 남기기
  const pathname = header_url.split('/').slice(3).join('/');
  const currentChannelName = pathname.split('/')[0];
  const currentChannelNameDecoded = decodeURIComponent(currentChannelName);

  try {
    const data = await fetchCommandList(currentChannelNameDecoded);
    return <DataTable data={data} />;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching command list:', error);
    return notFound();
  }
}
