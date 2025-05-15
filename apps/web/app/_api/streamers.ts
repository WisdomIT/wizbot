'use server';

import { trpc } from '@/src/utils/trpc';

export interface StreamerProps {
  channelName: string;
  channelImageUrl: string;
  channelId: string;
  shortcuts: ShortcutProps[];
}

export interface ShortcutProps {
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

export async function getStreamerByChannelName(channelName: string): Promise<StreamerProps | null> {
  const request = await trpc.user.getUserByChannelName.query({ channelName });

  if (!request) {
    return null;
  }

  const shortcuts = request.userShortcuts.map((shortcut) => {
    return {
      icon: shortcut.icon,
      name: shortcut.name,
      url: shortcut.url,
      popup: true,
    };
  });

  return {
    channelName: request.channelName,
    channelImageUrl: request.channelImageUrl ?? '',
    channelId: request.channelId,
    shortcuts,
  };
}
