'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface Repeat {
  id: number;
  response: string;
  interval: number;
}

export function createColumns({
  onUpdate,
  onDelete,
}: {
  onUpdate: (command: Repeat) => void;
  onDelete: (command: Repeat) => void;
}): ColumnDef<Repeat>[] {
  return [
    {
      accessorKey: 'id',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            className="-mx-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            ID
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        );
      },
      cell: ({ getValue }) => {
        return <span className="text-sm">{getValue<Repeat['id']>()}</span>;
      },
    },
    {
      accessorKey: 'response',
      header: '메시지',
      cell: ({ getValue }) => {
        return <span className="text-sm">{getValue<Repeat['response']>()}</span>;
      },
    },
    {
      accessorKey: 'interval',
      header: '반복 주기',
      cell: ({ getValue }) => {
        return <span className="text-sm">{getValue<Repeat['interval']>()}초</span>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const command = row.original;

        return (
          <div className="flex items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="font-bold">ID: {command.id}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    onUpdate(command);
                  }}
                >
                  반복 수정
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-500"
                  onClick={() => {
                    onDelete(command);
                  }}
                >
                  반복 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
