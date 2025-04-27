'use server';

import { trpc } from '@/src/utils/trpc';

export async function adminLogin(email: string) {
  return await trpc.admin.login.query({ email });
}
