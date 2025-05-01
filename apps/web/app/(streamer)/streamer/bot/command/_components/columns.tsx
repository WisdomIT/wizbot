'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal } from 'lucide-react';
import { JSX } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface Command {
  id: number;
  command: string;
  type: 'echo' | 'function';
  usage: JSX.Element;
  usageString: string;
  description: string;
  permission: 'STREAMER' | 'MANAGER' | 'VIEWER';
}

export const columns: ColumnDef<Command>[] = [
  {
    accessorKey: 'command',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="-mx-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          명령어
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ getValue }) => {
      return <span className="text-sm">{getValue<Command['command']>()}</span>;
    },
  },
  {
    accessorKey: 'type',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="-mx-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          타입
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ getValue }) => {
      return <span className="text-sm">{getValue<Command['type']>()}</span>;
    },
  },
  {
    accessorKey: 'usage',
    header: '사용법',
    cell: ({ getValue }) => {
      return <span className="text-sm">{getValue<Command['usage']>()}</span>;
    },
  },
  {
    accessorKey: 'description',
    header: '설명',
    cell: ({ getValue }) => {
      return <span className="text-sm">{getValue<Command['description']>()}</span>;
    },
  },
  {
    accessorKey: 'permission',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="-mx-3"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          권한
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ getValue }) => {
      return <span className="text-sm">{getValue<Command['permission']>()}</span>;
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
              <DropdownMenuLabel className="font-bold">{command.command} 메뉴</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(command.usageString)}>
                사용법 복사
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>편집 기능은 준비중입니다</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    },
  },
];
