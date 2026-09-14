import { AgentTabs } from './_components/agent-tabs';
import { AgentUsageView } from './usage/_components/agent-usage-view';

/** 에이전트 첫 화면 = 사용량 (#297). 설정은 /admin/agent/settings */
export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      <AgentUsageView />
    </div>
  );
}
