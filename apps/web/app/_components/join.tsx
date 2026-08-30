import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function Join() {
  return (
    <section id="community" className="py-12">
      <hr />
      <div className="container py-20 sm:py-20 mx-auto">
        <div className="lg:w-[60%] mx-auto">
          <Card className="bg-background shadow-none text-center flex flex-col items-center justify-center border-0">
            <CardHeader className="w-full">
              <CardTitle className="max-w-screen-md mx-auto text-center text-4xl md:text-5xl font-black leading-tight">
                위즈봇{' '}
                <span className="text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text">
                  사용하기
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="lg:w-[80%] text-sm md:text-lg font-bold text-muted-foreground mb-8">
              치지직 계정으로 로그인하면 바로 신청됩니다! 🚀
            </CardContent>

            <CardFooter>
              <Button asChild className="px-4 font-bold hover:gap-4">
                <Link href="/apply">
                  신청하기
                  <ArrowRight className="size-5 group-hover/arrow:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      <hr />
    </section>
  );
}
