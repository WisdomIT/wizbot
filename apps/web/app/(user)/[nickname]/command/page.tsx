'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { fetchCommandList } from './_api/command';
import { Command } from './_components/columns';
import { DataTable } from './_components/data-table';

export default function Page() {
  const pathname = usePathname();
  const currentChannelName = decodeURIComponent(pathname.split('/')[1]);

  const [data, setData] = useState<Command[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetchCommandList(currentChannelName);
        setData(response);
      } catch (error) {
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentChannelName]);

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>데이터 없음</div>;

  return <DataTable data={data} />;
}
