'use server';

import { trpc } from '@/src/utils/trpc';

export async function getChzzkId() {
  return await trpc.user.getChzzkId.query();
}

export async function getChzzkTokenInterlock(input: { code: string; state: string }) {
  return await trpc.user.getChzzkTokenInterlock.query(input);
}
