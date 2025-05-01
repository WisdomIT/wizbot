import { columns, Command } from './_components/columns';
import { DataTable } from './_components/data-table';

export default function Page() {
  const data = [
    {
      id: 1,
      command: 'hello',
      type: 'echo',
      usage: <>!hello</>,
      usageString: '!hello',
      description: 'This is a hello command',
      permission: 'VIEWER',
    },
    {
      id: 1,
      command: 'hello2',
      type: 'echo',
      usage: <>!hello2</>,
      usageString: '!hello2',
      description: 'This is a hello2 command',
      permission: 'VIEWER',
    },
  ] as Command[];

  return (
    <div>
      <DataTable columns={columns} data={data} />
    </div>
  );
}
