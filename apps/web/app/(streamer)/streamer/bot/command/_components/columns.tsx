'use client';

import type { UsageToken } from '@wizbot/shared/chatbot/definitions';
import { MoreHorizontal } from 'lucide-react';

import { renderTextWithLink } from '@/app/_components/utils';
import { type Permission, permissionLabel } from '@/app/_lib/permission';
import { UsageTokens } from '@/components/custom/usage-tokens';
import { SortableHeader } from '@/components/data-table/sortable-header';
import { createColumnHelper } from '@/components/data-table/table';
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

export interface Command {
  id: number;
  enabled: boolean;
  command: string;
  type: 'echo' | 'function';
  usageTokens: UsageToken[];
  usageString: string;
  description: string;
  permission: Permission;
  /** 호출 수 (#276) — 총·최근 30일·최근 7일 */
  stats: { total: number; d30: number; d7: number };
}

const formatCount = (value: number) => value.toLocaleString('ko-KR');

const col = createColumnHelper<Command>();

export function createColumns({
  onUpdate,
  onDelete,
  onToggle,
}: {
  onUpdate: (command: Command) => void;
  onDelete: (command: Command) => void;
  onToggle: (command: Command, enabled: boolean) => void;
}) {
  return [
    col.display({
      id: 'enabled',
      header: '사용',
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          onCheckedChange={(next) => onToggle(row.original, next)}
          aria-label={`${row.original.command} 명령어 사용 여부`}
        />
      ),
    }),
    col.accessor('command', {
      header: ({ column }) => <SortableHeader column={column}>명령어</SortableHeader>,
      cell: ({ getValue }) => <span className="text-sm">{getValue()}</span>,
    }),
    col.accessor('type', {
      header: ({ column }) => <SortableHeader column={column}>타입</SortableHeader>,
      cell: ({ getValue }) => (
        <span className="text-sm">{getValue() === 'echo' ? '단순 응답' : '기능'}</span>
      ),
    }),
    col.accessor('usageTokens', {
      header: '사용법',
      cell: ({ getValue }) => <UsageTokens tokens={getValue()} />,
    }),
    col.accessor('description', {
      header: '설명',
      cell: ({ getValue }) => (
        <span className="text-sm break-words whitespace-normal">
          {renderTextWithLink(getValue())}
        </span>
      ),
    }),
    col.accessor('permission', {
      header: ({ column }) => <SortableHeader column={column}>권한</SortableHeader>,
      cell: ({ getValue }) => <span className="text-sm">{permissionLabel(getValue())}</span>,
    }),
    col.accessor((row) => row.stats.total, {
      id: 'calls',
      header: ({ column }) => <SortableHeader column={column}>호출</SortableHeader>,
      cell: ({ row }) => {
        const { total, d30, d7 } = row.original.stats;
        return (
          <span className="whitespace-nowrap text-sm tabular-nums" title={`총 ${formatCount(total)}회 · 최근 30일 ${formatCount(d30)}회 · 최근 7일 ${formatCount(d7)}회`}>
            {formatCount(total)}
            <span className="text-muted-foreground"> · 30일 {formatCount(d30)} · 7일 {formatCount(d7)}</span>
          </span>
        );
      },
    }),
    col.display({
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
                <DropdownMenuLabel className="font-bold">{command.command} 명령어</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(command.usageString)}>
                  사용법 복사
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onUpdate(command)}>명령어 수정</DropdownMenuItem>
                <DropdownMenuItem className="text-red-500" onClick={() => onDelete(command)}>
                  명령어 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ];
}
