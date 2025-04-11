'use server';

import { trpc } from '@/src/utils/trpc';

export async function getChzzkId() {
  const chzzkId = await trpc.user.getChzzkId.query();
  return chzzkId;
}

export async function getChzzkTokenInterlock(input: { code: string; state: string }) {
  const chzzkToken = await trpc.user.getChzzkTokenInterlock.query(input);
  return chzzkToken;
}
