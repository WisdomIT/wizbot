'use client';

import { StreamerProps } from '@/app/_lib/streamers';
import { DataTable as Table } from '@/components/data-table/data-table';

import { columns } from './columns';

export function DataTable({ data }: { data: StreamerProps[] }) {
  return (
    <Table
      columns={columns}
      data={data}
      filterColumn="streamer"
      filterPlaceholder="스트리머 검색"
      unit="스트리머"
      emptyText="등록된 스트리머가 없습니다"
      pageSize={40}
      rowClassName={() => 'hover:bg-transparent'}
      className="w-full max-w-200"
    />
  );
}
