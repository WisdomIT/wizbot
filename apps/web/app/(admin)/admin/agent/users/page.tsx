import { Suspense } from 'react';

import { AgentTabs } from '../_components/agent-tabs';
import { AgentUsersView } from './_components/agent-users-view';

export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <AgentTabs />
      {/* 검색·정렬·페이지가 URL 쿼리라(#265) useSearchParams 에 Suspense 경계가 필요하다 */}
      <Suspense>
        <AgentUsersView />
      </Suspense>
    </div>
  );
}
