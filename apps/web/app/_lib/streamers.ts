import 'server-only';

import { unstable_cache } from 'next/cache';

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

/**
 * 공개 페이지용 스트리머 데이터 (#23).
 * 'use server' 액션(POST 엔드포인트 노출)이 아닌 서버 전용 유틸이며,
 * 60초 캐시로 방문마다 API 를 왕복하지 않는다.
 */
export const getStreamers = unstable_cache(
  async (): Promise<StreamerProps[]> => {
    const request = await trpc.user.getUsersPublic.query();

    return request.map((user) => {
      const shortcuts = user.userShortcuts.map((shortcut) => ({
        icon: shortcut.icon,
        name: shortcut.name,
        url: shortcut.url,
        popup: true,
      }));

      const commandShortcut = {
        icon: 'BotMessageSquare',
        name: '명령어',
        url: `/${user.channelName}/command`,
        popup: false,
      };

      return {
        channelName: user.channelName,
        channelImageUrl: user.channelImageUrl ?? '',
        channelId: user.channelId,
        shortcuts: [commandShortcut, ...shortcuts],
      };
    });
  },
  ['streamers-public'],
  { revalidate: 60 },
);

export const getStreamerByChannelName = unstable_cache(
  async (channelName: string): Promise<StreamerProps | null> => {
    const request = await trpc.user.getUserByChannelName.query({ channelName });
    if (!request) return null;

    return {
      channelName: request.channelName,
      channelImageUrl: request.channelImageUrl ?? '',
      channelId: request.channelId,
      shortcuts: request.userShortcuts.map((shortcut) => ({
        icon: shortcut.icon,
        name: shortcut.name,
        url: shortcut.url,
        popup: true,
      })),
    };
  },
  ['streamer-by-name'],
  { revalidate: 60 },
);
