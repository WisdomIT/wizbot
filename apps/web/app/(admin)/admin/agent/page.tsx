import { AgentSettingsView } from './_components/agent-settings-view';
import { AgentTabs } from './_components/agent-tabs';

export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      <AgentSettingsView />
    </div>
  );
}
