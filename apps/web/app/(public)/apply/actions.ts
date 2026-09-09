'use server';

import { trpc } from '@/src/utils/trpc';

/** 신청 사유 제출 — 신청자 세션(session-token, role=applicant)이 tRPC 로 전달된다 */
export async function submitApplication(reason: string) {
  const application = await trpc.signup.submit.mutate({ reason });
  return { status: application.status };
}
