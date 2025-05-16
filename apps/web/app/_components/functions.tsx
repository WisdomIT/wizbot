import { BotMessageSquare, Coffee, Headphones, Radio } from 'lucide-react';
import { JSX } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FunctionsProps {
  icon: JSX.Element;
  title: string;
  description: string;
}

const functionsList: FunctionsProps[] = [
  {
    icon: <BotMessageSquare className="size-8 text-blue-500" />,
    title: 'Echo 기능',
    description: '사전에 지정된 메시지를 표출합니다',
  },
  {
    icon: <Radio className="size-8 text-blue-500" />,
    title: '치지직 연동 기능',
    description:
      '방제 및 카테고리를 조회하거나 변경하는 등 치지직 API를 통한 관리 기능을 제공합니다',
  },
  {
    icon: <Headphones className="size-8 text-blue-500" />,
    title: '노래 신청 기능',
    description:
      '시청자가 명령어를 통해 노래를 신청하고, 방송에서 재생할 수 있습니다 (Youtube Music)',
  },
  {
    icon: <Coffee className="size-8 text-blue-500" />,
    title: '카페 대문 연동 기능',
    description: '현재 방송 상태 및 최신 유튜브 영상을 네이버 카페 대문에 연동할 수 있습니다',
  },
];

export default function Functions() {
  return (
    <section id="benefits" className="container py-24 sm:py-32 mx-auto px-4 md:px-0">
      <div className="grid lg:grid-cols-2 place-items-center lg:gap-24">
        <div className="w-full">
          <h2 className="md:text-lg text-blue-500 mb-2 tracking-wider font-black">Functions</h2>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">다양한 기능</h2>
          <p className="md:text-xl text-muted-foreground mb-8">
            위즈봇은 단순 채팅봇을 넘어 다양한 기능을 제공합니다
          </p>
        </div>
        <div className="grid lg:grid-cols-2 gap-4 w-full">
          {functionsList.map((item, index) => (
            <Card
              className="bg-muted/50 dark:bg-card hover:bg-background dark:hover:bg-background transition-all delay-75 group/number"
              key={`functions-${index}`}
            >
              <CardHeader>
                <div className="flex justify-between">
                  {item.icon}
                  <span className="text-5xl text-muted-foreground/15 font-bold transition-all delay-75 group-hover/number:text-muted-foreground/30">
                    0{(index + 1).toString()}
                  </span>
                </div>
                <CardTitle className="text-2xl font-extrabold">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {item.description}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
