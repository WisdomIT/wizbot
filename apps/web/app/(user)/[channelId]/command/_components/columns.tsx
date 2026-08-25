'use client';

import { type ColumnDef } from '@tanstack/react-table';
import type { UsageToken } from '@wizbot/shared/chatbot/definitions';
import { ArrowUpDown } from 'lucide-react';

import { renderTextWithLink } from '@/app/_components/utils';
import { UsageTokens } from '@/components/custom/usage-tokens';
import { Button } from '@/components/ui/button';

export interface Command {
  id: number;
  command: string;
  type: 'echo' | 'function';
  usageTokens: UsageToken[];
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
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      );
    },
    cell: ({ getValue }) => {
      return <span className="text-sm">{getValue<Command['command']>()}</span>;
    },
  },
  {
    accessorKey: 'usageTokens',
    header: '사용법',
    cell: ({ getValue }) => {
      return <UsageTokens tokens={getValue<Command['usageTokens']>()} />;
    },
  },
  {
    accessorKey: 'description',
    header: '설명',
    cell: ({ getValue }) => {
      return (
        <span className="text-sm">{renderTextWithLink(getValue<Command['description']>())}</span>
      );
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
          <ArrowUpDown className="h-4 w-4" />
        </Button>
      );
    },
    cell: ({ getValue }) => {
      const permission = getValue<Command['permission']>();
      let permissionText = '';
      switch (permission) {
        case 'STREAMER':
          permissionText = '스트리머';
          break;
        case 'MANAGER':
          permissionText = '매니저';
          break;
        case 'VIEWER':
          permissionText = '시청자';
          break;
        default:
          permissionText = '알 수 없음';
          break;
      }

      return <span className="text-sm">{permissionText}</span>;
    },
  },
];
