'use client';

import { type ColumnDef } from '@tanstack/react-table';
import type { UsageToken } from '@wizbot/shared/src/chatbot/definitions';
import { ArrowUpDown, MoreHorizontal } from 'lucide-react';

import { UsageTokens } from '@/components/custom/usage-tokens';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';

import { renderTextWithLink } from '../../../../../_components/utils';

export interface Command {
  id: number;
  enabled: boolean;
  command: string;
  type: 'echo' | 'function';
  usageTokens: UsageToken[];
  usageString: string;
  description: string;
  permission: 'STREAMER' | 'MANAGER' | 'VIEWER';
}

export function createColumns({
  onUpdate,
  onDelete,
  onToggle,
}: {
  onUpdate: (command: Command) => void;
  onDelete: (command: Command) => void;
  onToggle: (command: Command, enabled: boolean) => void;
}): ColumnDef<Command>[] {
  return [
    {
      id: 'enabled',
      header: '사용',
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          onCheckedChange={(next) => onToggle(row.original, next)}
          aria-label={`${row.original.command} 명령어 사용 여부`}
        />
      ),
    },
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
      accessorKey: 'type',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            className="-mx-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            타입
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        );
      },
      cell: ({ getValue }) => {
        return <span className="text-sm">{getValue<Command['type']>()}</span>;
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
                <DropdownMenuLabel className="font-bold">
                  {command.command} 명령어
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => navigator.clipboard.writeText(command.usageString)}
                >
                  사용법 복사
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    onUpdate(command);
                  }}
                >
                  명령어 수정
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-500"
                  onClick={() => {
                    onDelete(command);
                  }}
                >
                  명령어 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
