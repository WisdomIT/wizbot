'use client';

import Link from 'next/link';

import { ShortcutProps, StreamerProps } from '@/app/_lib/streamers';
import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { createColumnHelper } from '@/components/data-table/table';
import { Button } from '@/components/ui/button';

const col = createColumnHelper<StreamerProps>();

export const columns = [
  col.accessor((row) => row.channelName, {
    id: 'streamer',
    header: () => <div className="px-3">스트리머</div>,
    cell: ({ row }) => {
      const streamer = row.original;
      return (
        <span className="text-sm">
          <Button variant="ghost" asChild>
            <Link href={`/${streamer.channelId}/command`} className="flex items-center gap-2 py-2">
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
  }),
  col.accessor('shortcuts', {
    header: () => <div className="text-right px-3">링크</div>,
    cell: ({ getValue }) => (
      <span className="flex items-center justify-end">
        {getValue().map((shortcut: ShortcutProps, index: number) => (
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
    ),
  }),
];
