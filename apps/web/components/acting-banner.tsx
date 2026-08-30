import { ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * 어드민 대행 배너 (#71) — 화면이 스트리머 것과 똑같기 때문에 "남의 콘솔" 임을 항상 보여준다.
 * 대상 표시 · 즉시 적용/기록 경고 · 명시적 출구.
 */
export function ActingBanner({ name, channelId, exitHref }: { name: string; channelId: string; exitHref: string }) {
  return (
    <div className="mx-4 mb-2 flex flex-wrap items-center gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
      <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1">
        <span className="font-medium">어드민 대행 중 — {name}</span>
        <span className="ml-1 font-mono text-xs text-muted-foreground">{channelId}</span>
        <span className="ml-2 text-muted-foreground">여기서 바꾼 설정은 스트리머에게 바로 적용되고 변경 기록에 남습니다.</span>
      </div>
      {/* next/link 는 프리페치로 exit 라우트를 미리 호출해 쿠키를 지울 수 있다 — 일반 앵커로 */}
      <Button asChild size="sm" variant="outline">
        <a href={exitHref}>스트리머 목록으로</a>
      </Button>
    </div>
  );
}
