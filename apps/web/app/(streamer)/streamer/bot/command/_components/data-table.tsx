'use client';

import { useMemo, useState } from 'react';

import { DataTable as Table } from '@/components/data-table/data-table';

import { Command, createColumns } from './columns';
import DeleteCommand from './delete';
import NewCommand from './new';
import UpdateCommand from './update';

interface DataTableProps {
  data: Command[];
  onToggle: (command: Command, enabled: boolean) => void;
}

export function DataTable({ data, onToggle }: DataTableProps) {
  const [updateTarget, setUpdateTarget] = useState<Command | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Command | null>(null);

  const columns = useMemo(
    () => createColumns({ onUpdate: setUpdateTarget, onDelete: setDeleteTarget, onToggle }),
    [onToggle],
  );

  return (
    <Table
      columns={columns}
      data={data}
      filterColumn="command"
      filterPlaceholder="명령어 검색"
      toolbar={<NewCommand />}
      unit="명령어"
      emptyText="등록된 명령어가 없습니다"
      rowClassName={(row) => (row.enabled ? undefined : 'opacity-50')}
    >
      <DeleteCommand command={deleteTarget} setDeleteTarget={setDeleteTarget} />
      <UpdateCommand command={updateTarget} setUpdateTarget={setUpdateTarget} />
    </Table>
  );
}
