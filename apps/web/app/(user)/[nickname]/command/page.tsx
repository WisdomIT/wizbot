import { fetchCommandList } from './_api/command';
import { DataTable } from './_components/data-table';

export default async function Page({ params }: { params: { nickname: string } }) {
  const { nickname } = await params;
  const decodedNickname = decodeURIComponent(nickname);

  const data = await fetchCommandList(decodedNickname);

  return (
    <div>
      <DataTable data={data} />
    </div>
  );
}
