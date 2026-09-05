import { AgentTabs } from '../_components/agent-tabs';
import { AgentUsersView } from './_components/agent-users-view';

export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      <AgentUsersView />
    </div>
  );
}
