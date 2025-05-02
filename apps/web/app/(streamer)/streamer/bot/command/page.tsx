import { fetchCommandList } from './_api/command';
import { columns, Command } from './_components/columns';
import { DataTable } from './_components/data-table';

export default async function Page() {
  const data = await fetchCommandList();

  return (
    <div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
