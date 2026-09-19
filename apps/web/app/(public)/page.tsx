import Hero from '@/app/_components/hero';
import Join from '@/app/_components/join';
import Notices from '@/app/_components/notices';
import Showcase from '@/app/_components/showcase';
import Streamers from '@/app/_components/streamers';

export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="pt-20">
      <Hero />
      <Showcase />
      <Streamers />
      <Notices />
      <Join />
    </main>
  );
}
