'use server';

import { trpc } from '@/src/utils/trpc';

export async function getChzzkId() {
  const chzzkId = await trpc.user.getChzzkId.query();
  return chzzkId;
}

export async function getChzzkTokenInterlock(code: string) {
  const chzzkToken = await trpc.user.getChzzkTokenInterlock.query({ code });
  return chzzkToken;
}
