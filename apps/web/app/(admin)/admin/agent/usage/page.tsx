import { AgentTabs } from '../_components/agent-tabs';
import { AgentUsageView } from './_components/agent-usage-view';

export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      <AgentUsageView />
    </div>
  );
}
