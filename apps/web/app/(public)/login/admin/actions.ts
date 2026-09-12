'use server';

import { cookies } from 'next/headers';

import { signJwt } from '@/lib/jwt';
import { trpc } from '@/src/utils/trpc';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * 관리자 매직 링크의 패스코드를 검증·소모하고 세션을 발급한다.
 * 일회용 패스코드를 소모하므로 GET 에서 자동 실행하면 안 되고(메일 스캐너·프리페치),
 * 확인 페이지의 명시적 제출에서만 호출한다 (#19 리뷰).
 */
export async function adminLoginCheck(
  email: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const check = await trpc.admin.loginCheck.mutate({ email, code });
    const token = await signJwt({ id: check.id, role: 'admin' });

    const cookieStore = await cookies();
    cookieStore.set('session-token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return { ok: true };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during admin login check:', error);
    const message = error instanceof Error ? error.message : '로그인에 실패했습니다.';
    return { ok: false, message };
  }
}
