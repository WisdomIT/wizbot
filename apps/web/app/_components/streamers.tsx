import { BotMessageSquare, Coffee, Play, Radio } from 'lucide-react';
import Link from 'next/link';
import { JSX } from 'react';

import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface StreamerProps {
  channelName: string;
  channelImageUrl: string;
  channelId: string;
  shortcuts: { icon: JSX.Element; name: string; url: string; popup?: boolean }[];
}

const streamerList: StreamerProps[] = [
  {
    channelName: '빅헤드',
    channelImageUrl:
      'https://nng-phinf.pstatic.net/MjAyMzEyMTlfMzYg/MDAxNzAyOTcwODY1OTUy.1hHkqzH-zyEhyW2EJNfj1q6r7XTDeQNNqL_owQQ6AFwg.mCjDaHbdF0jjfhB2PvFuFJLxL9jQ-PV0oSLLDRXoGLUg.GIF/popHEAD.gif',
    channelId: 'ca1850b2eceb7f86146695fd9bb9cefc',
    shortcuts: [
      {
        icon: <BotMessageSquare />,
        name: '명령어',
        url: '/빅헤드',
      },
      {
        icon: <Radio />,
        name: '방송',
        url: 'https://chzzk.naver.com/ca1850b2eceb7f86146695fd9bb9cefc/',
        popup: true,
      },
      {
        icon: <Play />,
        name: '유튜브',
        url: 'https://www.youtube.com/@빅헤드',
        popup: true,
      },
      {
        icon: <Coffee />,
        name: '카페',
        url: 'https://cafe.naver.com/bighead033',
        popup: true,
      },
    ],
  },
  {
    channelName: '양아지',
    channelImageUrl:
      'https://nng-phinf.pstatic.net/MjAyNTA0MDJfMTQg/MDAxNzQzNTIwNTc0OTA0.lL8e5sGkq1Xr4QjOXEADTw7GNwETN_Qrpv8yf3Ct9mkg.nfR2X3wib3P6ekWFGEas3iHvdwG0trX0Ax5dwypLaN4g.PNG/2_%286%29.png',
    channelId: '3e825479d71ead63b76de0d6f6b5dc83',
    shortcuts: [
      {
        icon: <BotMessageSquare />,
        name: '명령어',
        url: '/양아지',
      },
      {
        icon: <Radio />,
        name: '방송',
        url: 'https://chzzk.naver.com/3e825479d71ead63b76de0d6f6b5dc83/',
        popup: true,
      },
      {
        icon: <Play />,
        name: '유튜브',
        url: 'https://www.youtube.com/@양아지',
        popup: true,
      },
      {
        icon: <Coffee />,
        name: '카페',
        url: 'https://cafe.naver.com/azi025',
        popup: true,
      },
    ],
  },
];

export default function Streamers() {
  return (
    <section id="team" className="container lg:w-[75%] py-24 sm:py-32 mx-auto  px-4 md:px-0">
      <div className="md:text-center mb-8">
        <h2 className="md:text-lg text-blue-500 mb-2 tracking-wider font-black">Streamers</h2>

        <h2 className="text-3xl md:text-4xl font-bold mb-4">위즈봇을 사용중인 스트리머</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {streamerList.map((streamer, index) => (
          <Card
            className="bg-muted/60 dark:bg-card flex flex-col h-full overflow-hidden group/hoverimg py-0"
            key={`streamer-${index}`}
          >
            <CardHeader className="p-0 gap-0">
              <div className="h-full overflow-hidden">
                <img
                  alt=""
                  src={streamer.channelImageUrl}
                  className="bg-white w-full aspect-square object-cover transition-all duration-200 ease-linear size-full "
                />
              </div>
              <CardTitle className="py-6 pb-4 px-6 text-2xl">{streamer.channelName}</CardTitle>
            </CardHeader>
            <CardFooter className="space-x-4 mt-auto pb-6">
              {streamer.shortcuts.map((shortcut, index) => (
                <Link
                  key={`streamer-shortcut-${index}`}
                  target={shortcut.popup ? '_blank' : undefined}
                  rel={shortcut.popup ? 'noopener noreferrer' : undefined}
                  href={shortcut.url}
                  title={shortcut.name}
                  className="flex items-center space-x-2 text-sm font-bold text-muted-foreground hover:text-blue-500 transition-all"
                >
                  {shortcut.icon}
                </Link>
              ))}
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  );
}
