'use server';

import { trpc } from '@/src/utils/trpc';

export async function getChzzkId() {
  const chzzkId = await trpc.user.getChzzkId.query();
  return chzzkId;
}
