'use server';

import { cookies } from 'next/headers';

import { verifyJwt } from '@/lib/jwt';
import { trpc } from '@/src/utils/trpc';

export async function getCurrentStreamer() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session-token')?.value;

  if (!token) {
    throw new Error('Unauthorized');
  }

  const payload = await verifyJwt(token);

  if (payload.role !== 'streamer') {
    throw new Error('Unauthorized');
  }

  const userRequest = await trpc.user.getUser.query({ id: payload.id });

  if (!userRequest) {
    throw new Error('Unauthorized');
  }

  return userRequest;
}
