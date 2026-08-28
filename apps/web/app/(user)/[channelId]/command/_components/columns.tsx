'use client';

import type { UsageToken } from '@wizbot/shared/chatbot/definitions';

import { renderTextWithLink } from '@/app/_components/utils';
import { type Permission, permissionLabel } from '@/app/_lib/permission';
import { UsageTokens } from '@/components/custom/usage-tokens';
import { SortableHeader } from '@/components/data-table/sortable-header';
import { createColumnHelper } from '@/components/data-table/table';

export interface Command {
  id: number;
  command: string;
  type: 'echo' | 'function';
  usageTokens: UsageToken[];
  usageString: string;
  description: string;
  permission: Permission;
}

const col = createColumnHelper<Command>();

export const columns = [
  col.accessor('command', {
    header: ({ column }) => <SortableHeader column={column}>명령어</SortableHeader>,
    cell: ({ getValue }) => <span className="text-sm">{getValue()}</span>,
  }),
  col.accessor('usageTokens', {
    header: '사용법',
    cell: ({ getValue }) => <UsageTokens tokens={getValue()} />,
  }),
  col.accessor('description', {
    header: '설명',
    cell: ({ getValue }) => <span className="text-sm">{renderTextWithLink(getValue())}</span>,
  }),
  col.accessor('permission', {
    header: ({ column }) => <SortableHeader column={column}>권한</SortableHeader>,
    cell: ({ getValue }) => <span className="text-sm">{permissionLabel(getValue())}</span>,
  }),
];
