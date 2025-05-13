import { ArrowRight } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function Hero() {
  return (
    <section id="hero" className="container mx-auto">
      <div className="grid place-items-center lg:max-w-screen-xl gap-8 mx-auto py-40 md:py-32">
        <div className="text-center space-y-8">
          <div className="max-w-screen-md mx-auto text-center text-5xl md:text-6xl font-black leading-none">
            <h1>
              <span className="text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text">
                Over
              </span>{' '}
              The Chatbot
            </h1>
          </div>
          <p className="max-w-screen-sm mx-auto text-sm md:text-lg font-bold text-muted-foreground">
            {`치지직 공식 API로 구현된 밴 걱정 없는 위즈봇`}
            <br />
            {`시청자 노래 신청과 카페 대문 연동까지`}
          </p>
          <div className="space-y-4 md:space-y-0 md:space-x-4">
            <Button className="px-4 font-bold">
              명령어 보러가기
              <ArrowRight className="size-5 group-hover/arrow:translate-x-1 transition-transform" />
            </Button>
            <Button variant="secondary" className="px-4 font-bold">
              스트리머 로그인
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
