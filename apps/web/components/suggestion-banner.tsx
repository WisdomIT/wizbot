'use client';

import { Lightbulb, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * 제안 카드 (#276) — 강제성 없는 넛지. 문구 + 액션 버튼 + 숨기기.
 * 숨기면 조건이 해제되기 전까지 다시 뜨지 않는다 (서버가 판정).
 */
export function SuggestionBanner({
  children,
  actions,
  onDismiss,
  dismissLabel = '숨기기',
}: {
  children: React.ReactNode;
  actions?: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div>}
      {onDismiss && (
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" onClick={onDismiss} aria-label={dismissLabel} title={dismissLabel}>
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
