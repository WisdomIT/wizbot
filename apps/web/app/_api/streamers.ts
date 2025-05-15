'use server';

import { trpc } from '@/src/utils/trpc';

interface StreamerProps {
  channelName: string;
  channelImageUrl: string;
  channelId: string;
  shortcuts: ShortcutProps[];
}

interface ShortcutProps {
  icon: string;
  name: string;
  url: string;
  popup?: boolean;
}

export async function getStreamers(): Promise<StreamerProps[]> {
  const request = await trpc.user.getUsersPublic.query();

  const streamers: StreamerProps[] = request.map((user) => {
    const shortcuts = user.userShortcuts.map((shortcut) => {
      return {
        icon: shortcut.icon,
        name: shortcut.name,
        url: shortcut.url,
        popup: true,
      };
    });

    const commandShoutcut = {
      icon: 'BotMessageSquare',
      name: '명령어',
      url: `/${user.channelName}/command`,
      popup: false,
    };

    return {
      channelName: user.channelName,
      channelImageUrl: user.channelImageUrl ?? '',
      channelId: user.channelId,
      shortcuts: [commandShoutcut, ...shortcuts],
    };
  });

  return streamers;
}
