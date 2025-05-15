import { getStreamers } from '../_api/streamers';
import { DataTable } from './_components/data-table';

export default async function Page() {
  const data = await getStreamers();

  return (
    <main className="flex flex-col items-center justify-center w-full h-full p-4">
      <div className="max-w-screen-md mx-auto text-center text-4xl md:text-5xl font-black leading-tight py-20">
        <span className="text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text">
          위즈봇
        </span>
        을 사용중인 스트리머
      </div>
      <DataTable data={data} />
    </main>
  );
}
