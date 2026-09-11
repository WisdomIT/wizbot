'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { openAgentWith } from '@/components/agent/agent-bus';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SuggestionBanner } from '@/components/suggestion-banner';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/src/utils/trpc-react';

type Suggestion = ReturnType<typeof useSuggestions>['data'] extends (infer T)[] | undefined ? T : never;
type CommandType = 'echo' | 'function';

function useSuggestions() {
  const trpc = useTRPC();
  return useQuery(trpc.suggestion.list.queryOptions());
}

/**
 * 명령어 페이지 상단 제안 (#276 3단계) — 안 쓰는 명령어 삭제, 꺼진 명령어 켜기, 없는 명령어 만들기(에이전트), 용법 오류.
 * 스트리머 본인 콘솔에서만 — 어드민 대행 콘솔에는 띄우지 않는다.
 */
export function CommandSuggestions() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const acting = pathname.startsWith('/admin');
  const { data } = useSuggestions();
  const { data: agent } = useQuery(trpc.agent.status.queryOptions());
  const dismiss = useMutation(trpc.suggestion.dismiss.mutationOptions());
  const setEnabled = useMutation(trpc.command.setEnabled.mutationOptions());
  const deleteCommand = useMutation(trpc.command.deleteCommand.mutationOptions());
  const [deleteTarget, setDeleteTarget] = useState<{ type: CommandType; id: number; command: string } | null>(null);

  if (acting || !data || data.length === 0) return null;

  const refresh = () => {
    void queryClient.invalidateQueries(trpc.suggestion.list.queryFilter());
    void queryClient.invalidateQueries(trpc.command.getCommandList.queryFilter());
  };
  const hide = (item: Suggestion) => {
    dismiss.mutate({ kind: item.kind, key: item.key }, { onSuccess: refresh, onError: (error) => toast.error(error.message) });
  };
  const run = (promise: Promise<unknown>, success: string) =>
    toast.promise(promise, { loading: '처리 중...', success: () => { refresh(); return success; }, error: (error) => `실패했습니다. ${error instanceof Error ? error.message : error}` });

  const unused = data.filter((item) => item.kind === 'UNUSED_COMMAND');
  const others = data.filter((item) => item.kind !== 'UNUSED_COMMAND');
  const agentReady = !!agent?.enabled;

  return (
    <div className="flex flex-col gap-2 pt-4">
      {unused.length > 0 && (
        <SuggestionBanner>
          <span>
            {unused.map((item) => `!${item.payload.command}`).join(', ')} 명령어가 최근 한 달간 한 번도 쓰이지 않았습니다. 삭제하시겠어요?
          </span>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {unused.map((item) => (
              <li key={item.key} className="flex items-center gap-1">
                <span className="font-mono text-xs">!{item.payload.command}</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-red-500" onClick={() => setDeleteTarget(item.payload)}>
                  삭제
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-muted-foreground" onClick={() => hide(item)}>
                  숨기기
                </Button>
              </li>
            ))}
          </ul>
        </SuggestionBanner>
      )}

      {others.map((item) => {
        if (item.kind === 'DISABLED_COMMAND') {
          return (
            <SuggestionBanner
              key={`${item.kind}:${item.key}`}
              onDismiss={() => hide(item)}
              actions={
                <Button type="button" size="sm" variant="outline" onClick={() => run(setEnabled.mutateAsync({ id: item.payload.id, type: item.payload.type, enabled: true }), `!${item.payload.command} 명령어를 켰습니다.`)}>
                  켜기
                </Button>
              }
            >
              <span>!{item.payload.command} 명령어가 최근 한 달간 {item.payload.count.toLocaleString('ko-KR')}번 호출됐지만 꺼져 있습니다.</span>
            </SuggestionBanner>
          );
        }
        if (item.kind === 'MISSING_COMMAND') {
          return (
            <SuggestionBanner
              key={`${item.kind}:${item.key}`}
              onDismiss={() => hide(item)}
              actions={
                agentReady && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      openAgentWith(
                        `!${item.payload.command} 명령어를 만들고 싶어요. 시청자들이 최근 한 달간 ${item.payload.count}번 호출했는데 아직 없는 명령어예요. 어떤 명령어로 만들면 좋을지 제안해주고, 정해지면 바로 만들어줘.`,
                      )
                    }
                  >
                    에이전트로 만들기
                  </Button>
                )
              }
            >
              <span>시청자들이 <span className="font-mono">!{item.payload.command}</span> 를 최근 한 달간 {item.payload.count.toLocaleString('ko-KR')}번 호출했습니다.</span>
            </SuggestionBanner>
          );
        }
        return (
          <SuggestionBanner
            key={`${item.kind}:${item.key}`}
            onDismiss={() => hide(item)}
            actions={
              agentReady && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openAgentWith(
                      `!${item.payload.command} 명령어 사용법을 시청자들이 자주 틀려요 (최근 한 달간 ${item.payload.count}번). 응답 문구에 사용법 안내를 넣거나 더 쓰기 쉽게 바꿀 방법을 제안해줘.`,
                    )
                  }
                >
                  에이전트에게 맡기기
                </Button>
              )
            }
          >
            <span>!{item.payload.command} 명령어의 사용법을 틀리는 경우가 최근 한 달간 {item.payload.count.toLocaleString('ko-KR')}번 있었습니다. 응답에 사용법을 넣어 두면 줄어듭니다.</span>
          </SuggestionBanner>
        );
      })}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="명령어 삭제"
        description={deleteTarget ? `!${deleteTarget.command} 명령어를 삭제합니다. 삭제하면 되돌릴 수 없습니다.` : ''}
        confirmLabel="삭제"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          setDeleteTarget(null);
          run(deleteCommand.mutateAsync({ id: target.id, type: target.type }), `!${target.command} 명령어를 삭제했습니다.`);
        }}
      />
    </div>
  );
}
