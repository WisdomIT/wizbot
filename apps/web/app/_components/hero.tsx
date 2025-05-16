import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function Hero() {
  return (
    <section id="hero" className="container mx-auto">
      <div className="grid place-items-center lg:max-w-screen-xl gap-8 mx-auto py-20 md:py-40">
        <div className="text-center space-y-8">
          <div className="max-w-screen-md mx-auto text-center text-5xl md:text-6xl font-black leading-tight">
            <h1>
              <span className="text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text">
                위즈봇,
              </span>
              <br />
              {'챗봇 그 이상'}
            </h1>
          </div>
          <p className="max-w-screen-sm mx-auto text-sm md:text-lg font-bold text-muted-foreground">
            <span className="font-black underline underline-offset-2">{`치지직 공식 API`}</span>
            {`로 구현된 밴 걱정 없는 위즈봇`}
            <br />
            {`시청자 노래 신청과 카페 대문 연동까지`}
          </p>
          <div className="space-y-4 md:space-y-0 md:space-x-4">
            <Button asChild className="px-4 font-bold hover:gap-4">
              <Link href="/list">
                명령어 보러가기
                <ArrowRight className="size-5 group-hover/arrow:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button asChild variant="secondary" className="px-4 font-bold">
              <Link href="/login">스트리머 로그인</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
