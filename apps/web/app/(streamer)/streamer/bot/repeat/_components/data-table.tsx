'use client';

import { useMemo, useState } from 'react';

import { DataTable as Table } from '@/components/data-table/data-table';

import { createColumns, Repeat } from './columns';
import DeleteCommand from './delete';
import UpdateInterval from './interval';
import NewRepeat from './new';
import UpdateCommand from './update';

interface DataTableProps {
  data: Repeat[];
  interval: number;
  onToggle: (repeat: Repeat, enabled: boolean) => void;
}

export function DataTable({ data, interval, onToggle }: DataTableProps) {
  const [updateTarget, setUpdateTarget] = useState<Repeat | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Repeat | null>(null);

  const columns = useMemo(
    () => createColumns({ onUpdate: setUpdateTarget, onDelete: setDeleteTarget, onToggle }),
    [onToggle],
  );

  return (
    <Table
      columns={columns}
      data={data}
      toolbar={
        <>
          <UpdateInterval interval={interval} />
          <NewRepeat interval={interval} />
        </>
      }
      unit="반복"
      emptyText="등록된 반복이 없습니다"
      rowClassName={(row) => (row.enabled ? undefined : 'opacity-50')}
    >
      <DeleteCommand repeat={deleteTarget} setDeleteTarget={setDeleteTarget} />
      <UpdateCommand repeat={updateTarget} setUpdateTarget={setUpdateTarget} />
    </Table>
  );
}
