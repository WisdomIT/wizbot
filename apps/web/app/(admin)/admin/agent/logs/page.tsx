import { AgentTabs } from '../_components/agent-tabs';
import { AgentLogsView } from './_components/agent-logs-view';

export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      <AgentLogsView />
    </div>
  );
}
