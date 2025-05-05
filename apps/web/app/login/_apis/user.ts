'use server';

import { cookies } from 'next/headers';

import { verifyJwt } from '@/lib/jwt';
import { trpc } from '@/src/utils/trpc';

interface Streamer {
  role: 'streamer';
  id: number;
  channelId: string;
  channelImageUrl: string | null;
  channelName: string;
}

interface Admin {
  role: 'admin';
  id: number;
}

export type CurrentUser = Streamer | Admin;

export async function getCurrentUser(): Promise<CurrentUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get('session-token')?.value;

  if (!token) {
    throw new Error('Unauthorized');
  }

  const payload = await verifyJwt(token);

  if (payload.role === 'streamer') {
    const streamerRequest = await trpc.user.getUser.query({ id: payload.id });

    if (!streamerRequest) {
      throw new Error('Unauthorized');
    }

    return { role: 'streamer', ...streamerRequest };
  }

  if (payload.role === 'admin') {
    return { role: 'admin', id: payload.id };
  }

  throw new Error('Unauthorized');
}
