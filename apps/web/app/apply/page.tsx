import { Bot } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { verifyJwt } from '@/lib/jwt';
import { trpc } from '@/src/utils/trpc';

import { ApplyForm } from './_components/apply-form';
import { ApplyIntro } from './_components/apply-intro';

export const metadata: Metadata = { title: '위즈봇 사용 신청' };
// 세션 쿠키에 따라 내용이 갈린다 — 정적으로 굽지 않는다
export const dynamic = 'force-dynamic';

async function getSessionRole() {
  const token = (await cookies()).get('session-token')?.value;
  if (!token) return null;
  try {
    return (await verifyJwt(token)).role;
  } catch {
    return null;
  }
}

/**
 * 사용 신청 (#96). 치지직 OAuth 가 곧 본인 인증이다.
 * - 세션 없음 → 안내 + 「치지직으로 로그인해 신청하기」 (로그인이 곧 신청)
 * - 신청자 세션 → 현재 상태 + 사유 입력
 * - 스트리머 세션 → 이미 승인된 사용자. 콘솔로
 */
export default async function ApplyPage() {
  const role = await getSessionRole();
  if (role === 'streamer') redirect('/streamer');
  if (role === 'admin') redirect('/admin/applications');

  // 신청자 세션이 만료됐거나 신청 레코드가 사라졌으면 안내 화면으로
  const application =
    role === 'applicant' ? await trpc.signup.me.query().catch(() => null) : null;

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <Bot className="size-4" />
          </div>
          위즈봇
        </Link>
        {application ? <ApplyForm application={application} /> : <ApplyIntro />}
      </div>
    </div>
  );
}
