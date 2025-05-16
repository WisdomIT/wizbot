'use client';

import { type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';

import { ShortcutProps, StreamerProps } from '@/app/_api/streamers';
import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { Button } from '@/components/ui/button';

export const columns: ColumnDef<StreamerProps>[] = [
  {
    accessorKey: 'streamer',
    accessorFn: (row) => row.channelName,
    header: () => <div className="px-3">스트리머</div>,
    cell: ({ row }) => {
      const streamer = row.original;

      return (
        <span className="text-sm">
          <Button variant="ghost" asChild>
            <Link
              href={`/${streamer.channelName}/command`}
              className="flex items-center gap-2 py-2"
            >
              <img
                alt={streamer.channelName}
                src={streamer.channelImageUrl ?? ''}
                className="w-8 h-8 rounded-full"
              />
              {streamer.channelName}
            </Link>
          </Button>
        </span>
      );
    },
  },
  {
    accessorKey: 'shortcuts',
    header: () => <div className="text-right px-3">링크</div>,
    cell: ({ getValue }) => {
      const shortcuts = getValue<ShortcutProps[]>();
      return (
        <span className="flex items-center justify-end">
          {shortcuts.map((shortcut, index) => (
            <Button key={index} variant="ghost" className="text-sm" asChild>
              <Link
                href={shortcut.url}
                target={shortcut.popup ? '_blank' : undefined}
                rel={shortcut.popup ? 'noopener noreferrer' : undefined}
              >
                <DynamicIcon
                  name={shortcut.icon}
                  className="text-muted-foreground hover:text-blue-500 transition-all"
                  size={20}
                />
              </Link>
            </Button>
          ))}
        </span>
      );
    },
  },
];
