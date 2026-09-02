import { AgentTabs } from '../../_components/agent-tabs';
import { AgentLogView } from './_components/agent-log-view';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      <AgentLogView id={Number(id)} />
    </div>
  );
}
