import { fetchCommandList } from './_api/command';
import { DataTable } from './_components/data-table';

export default async function Page() {
  const data = await fetchCommandList();

  return (
    <div>
      <DataTable data={data} />
    </div>
  );
}
