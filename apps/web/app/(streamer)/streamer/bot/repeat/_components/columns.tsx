'use client';

import { MoreHorizontal } from 'lucide-react';

import { renderTextWithLink } from '@/app/_components/utils';
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

export interface Repeat {
  id: number;
  enabled: boolean;
  response: string;
  interval: number;
}

const col = createColumnHelper<Repeat>();

export function createColumns({
  onUpdate,
  onDelete,
  onToggle,
}: {
  onUpdate: (repeat: Repeat) => void;
  onDelete: (repeat: Repeat) => void;
  onToggle: (repeat: Repeat, enabled: boolean) => void;
}) {
  return [
    col.display({
      id: 'enabled',
      header: '사용',
      cell: ({ row }) => (
        <Switch
          checked={row.original.enabled}
          onCheckedChange={(next) => onToggle(row.original, next)}
          aria-label={`${row.original.id}번 반복 메시지 사용 여부`}
        />
      ),
    }),
    col.accessor('id', {
      header: ({ column }) => <SortableHeader column={column}>ID</SortableHeader>,
      cell: ({ getValue }) => <span className="text-sm">{getValue()}</span>,
    }),
    col.accessor('response', {
      header: '메시지',
      cell: ({ getValue }) => <span className="text-sm">{renderTextWithLink(getValue())}</span>,
    }),
    col.accessor('interval', {
      header: '반복 주기',
      cell: ({ getValue }) => <span className="text-sm">{getValue()}초</span>,
    }),
    col.display({
      id: 'actions',
      cell: ({ row }) => {
        const repeat = row.original;
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
                <DropdownMenuLabel className="font-bold">ID: {repeat.id}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onUpdate(repeat)}>반복 수정</DropdownMenuItem>
                <DropdownMenuItem className="text-red-500" onClick={() => onDelete(repeat)}>
                  반복 삭제
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ];
}
