import { Suspense } from 'react';

import { AgentTabs } from '../_components/agent-tabs';
import { AgentLogsView } from './_components/agent-logs-view';

export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      {/* useSearchParams(사용자 탭에서 넘어오는 ?user=)는 Suspense 경계가 필요하다 */}
      <Suspense>
        <AgentLogsView />
      </Suspense>
    </div>
  );
}
