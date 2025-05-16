import Functions from './_components/functions';
import Hero from './_components/hero';
import Join from './_components/join';
import Streamers from './_components/streamers';

export default function Home() {
  return (
    <main className="py-20">
      <Hero />
      <Functions />
      <Streamers />
      <Join />
    </main>
  );
}
