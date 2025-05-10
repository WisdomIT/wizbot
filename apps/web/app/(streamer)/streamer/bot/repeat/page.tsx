import { fetchRepeatList, fetchUserDefaultInterval } from './_api/repeat';
import { DataTable } from './_components/data-table';

export default async function Page() {
  const data = await fetchRepeatList();
  const interval = await fetchUserDefaultInterval();

  return (
    <div>
      <DataTable data={data} interval={interval} />
    </div>
  );
}
