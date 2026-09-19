import { ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * 히어로 (#277). 부제는 「공식 API」 대신 포지셔닝 — 경쟁 봇도 전부 치지직 계정 연동이라 차별점이 아니다.
 * 「밴 걱정 없음」은 신뢰 신호로 작은 배지 한 줄만. 「올인원」「모든 기능」류는 쓰지 않는다(기능 개수 비교 프레임 회피)
 */
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
            {'명령어·뮤직 플레이어·네이버 카페 대문까지'}
            <br />
            {'에이전트에게 말하면 위즈봇이 대신 설정합니다'}
          </p>
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-muted-foreground">
              <ShieldCheck className="size-3.5 text-blue-500" /> 치지직 공식 API 기반 · 밴 걱정 없음
            </span>
          </div>
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
            <Button asChild variant="outline" className="px-4 font-bold">
              <Link href="/manual">이용 안내</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
