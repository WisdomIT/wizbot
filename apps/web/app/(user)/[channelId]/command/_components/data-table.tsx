'use client';

import { DataTable as Table } from '@/components/data-table/data-table';

import { columns, Command } from './columns';

export function DataTable({ data }: { data: Command[] }) {
  return (
    <Table
      columns={columns}
      data={data}
      filterColumn="command"
      filterPlaceholder="명령어 검색"
      unit="명령어"
      emptyText="등록된 명령어가 없습니다"
    />
  );
}
