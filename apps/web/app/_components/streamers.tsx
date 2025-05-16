import Link from 'next/link';
import { Suspense, use } from 'react';

import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

import { getStreamers } from '../_api/streamers';

export default function Streamers() {
  const streamerList = use(getStreamers());

  return (
    <section id="team" className="container lg:w-[75%] py-24 sm:py-32 mx-auto  px-4 md:px-0">
      <div className="md:text-center mb-8">
        <h2 className="md:text-lg text-blue-500 mb-2 tracking-wider font-black">Streamers</h2>

        <h2 className="text-3xl md:text-4xl font-bold mb-4">위즈봇을 사용중인 스트리머</h2>
      </div>
      <Suspense fallback={<div className="text-center">Loading...</div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {streamerList.map((streamer, index) => (
            <Card
              className="bg-muted/60 dark:bg-card flex flex-col h-full overflow-hidden group/hoverimg py-0"
              key={streamer.channelId}
            >
              <CardHeader className="p-0 gap-0">
                <div className="h-full overflow-hidden">
                  <img
                    alt={`${streamer.channelName} profile`}
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
                    <DynamicIcon name={shortcut.icon} />
                  </Link>
                ))}
              </CardFooter>
            </Card>
          ))}
        </div>
      </Suspense>
    </section>
  );
}
