'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { adminLogin } from '../_apis/admin';
import { getChzzkId, getChzzkRedirectUrl } from '../_apis/chzzk';

export function LoginForm({ className, ...props }: React.ComponentProps<'div'>) {
  const [loading, setLoading] = useState(false);

  async function handleChzzkLogin() {
    const chzzkId = await getChzzkId();
    const redirectUri = await getChzzkRedirectUrl();
    if (!chzzkId || !redirectUri) {
      throw new Error('Chzzk ID or redirect URI is not defined');
    }

    window.location.href = `https://chzzk.naver.com/account-interlock?clientId=${chzzkId}&redirectUri=${redirectUri}&state=zxclDasdfA25`;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (loading) return;

    setLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email') as string;

    if (!email) {
      toast.warning('이메일을 입력해주세요.');
      return;
    }

    try {
      toast.promise(adminLogin(email), {
        loading: '로그인 중...',
        success: (data) => {
          if (data.ok) {
            return '로그인 링크가 발송되었습니다. 이메일을 확인해주세요.';
          } else {
            return '로그인에 실패했습니다.';
          }
        },
        error: (error) => {
          if (error instanceof Error) {
            return error.message;
          }
          return '로그인에 실패했습니다.';
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">로그인</CardTitle>
          <CardDescription>스트리머 대시보드</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-6">
              <div className="flex flex-col gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full cursor-pointer"
                  onClick={handleChzzkLogin}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
                    <path
                      d="M7.27077 2L3.97708 6.76349H7.96418L3 14H13.543V10.8963H9.08309L14 3.75934H9.99713L11.2106 2H7.27077Z"
                      fill="currentColor"
                    />
                  </svg>
                  치지직으로 로그인
                </Button>
              </div>
              <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                <span className="bg-card text-muted-foreground relative z-10 px-2">혹은</span>
              </div>
              <div className="grid gap-6">
                <div className="grid gap-3">
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="m@example.com"
                    required
                  />
                </div>
                <Button type="submit" className="w-full">
                  로그인
                </Button>
              </div>
              <div className="text-center text-sm">
                위즈봇을 이용하고 싶으신가요?{' '}
                <Link href="#" className="underline underline-offset-4">
                  신청하기
                </Link>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        <Link className="mr-4" href="#">
          서비스 이용약관
        </Link>
        <Link href="#">개인정보 처리방침</Link>
      </div>
    </div>
  );
}
