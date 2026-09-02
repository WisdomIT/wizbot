'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldQuestion, Wrench } from 'lucide-react';

import Markdown from '@/components/custom/markdown';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 대화 상세 (#35, pelican conversation 뷰 이식).
 * - tool 호출과 결과는 하나의 블록으로 합쳐 보인다 (tool_use_id 로 짝을 맞춤)
 * - 각 채팅에 시각을, 어시스턴트 턴에는 모델·토큰 사용량을 붙인다 (usage.messageId 연결)
 */

type Block =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; id?: string; name?: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string; content?: string; is_error?: boolean }
  | { type: 'web_search'; query?: string };

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  PENDING: { label: '대기', variant: 'outline' },
  APPROVED: { label: '승인됨', variant: 'default' },
  DECLINED: { label: '거절됨', variant: 'secondary' },
  EXPIRED: { label: '만료됨', variant: 'outline' },
};

const time = (value: string | Date) => new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });

export function AgentLogView({ id }: { id: number }) {
  const trpc = useTRPC();
  const { data, error, isPending } = useQuery(trpc.agent.adminConversation.queryOptions({ id }));

  if (isPending) return <Skeleton className="mt-4 h-96 w-full" />;
  if (error || !data) return <p className="py-8 text-sm text-muted-foreground">대화를 불러오지 못했습니다: {error?.message}</p>;

  const actionByToolUse = new Map(data.actions.map((action) => [action.toolUseId, action]));
  const usageByMessage = new Map(data.usages.filter((row) => row.messageId !== null).map((row) => [row.messageId, row]));

  //  tool 결과를 먼저 전부 모아 호출과 짝을 맞춘다 — 결과는 별도 행(user role)에 실려 있다
  const parsed = data.messages.map((message) => {
    let blocks: Block[] = [];
    try {
      const raw = JSON.parse(message.contentJson) as unknown;
      blocks = Array.isArray(raw) ? (raw as Block[]) : [{ type: 'text', text: String(raw) }];
    } catch {
      /* 형식이 깨진 행은 건너뛴다 */
    }
    return { ...message, blocks };
  });
  const resultOf = new Map<string, { content?: string; is_error?: boolean }>();
  for (const message of parsed) {
    for (const block of message.blocks) {
      if (block.type === 'tool_result' && block.tool_use_id) resultOf.set(block.tool_use_id, block);
    }
  }

  const totalIn = data.usages.reduce((sum, row) => sum + row.inputTokens, 0);
  const totalOut = data.usages.reduce((sum, row) => sum + row.outputTokens, 0);
  const totalCache = data.usages.reduce((sum, row) => sum + row.cacheReadTokens, 0);

  return (
    <div className="flex max-w-3xl flex-col gap-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{data.title}</h2>
        {data.deleted && <Badge variant="secondary">삭제됨</Badge>}
        <span className="text-sm text-muted-foreground">
          {data.channelName} · {time(data.createdAt)}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {parsed.map((message) => {
          const usage = usageByMessage.get(message.id);
          const rendered = message.blocks
            .map((block, index) => {
              const key = `${message.id}-${index}`;
              if (block.type === 'text' && block.text) {
                return message.role === 'user' ? (
                  <div key={key} className="flex flex-col items-end gap-0.5 self-end">
                    <div className="ml-16 whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{block.text}</div>
                    <span className="text-[11px] text-muted-foreground">{time(message.createdAt)}</span>
                  </div>
                ) : (
                  <div key={key} className="prose prose-sm dark:prose-invert mr-16 max-w-none self-start rounded-lg bg-muted px-3 py-2 text-sm">
                    <Markdown>{block.text}</Markdown>
                  </div>
                );
              }
              if (block.type === 'tool_use') {
                const action = block.id ? actionByToolUse.get(block.id) : undefined;
                const result = block.id ? resultOf.get(block.id) : undefined;
                //  승인 카드는 사용자가 본 것과 같은 카드 형태로 (pelican conversation 뷰의 resolved_cards 와 동일).
                //  실행 입력·결과는 관리자용 상세로 카드 안에 접어 둔다
                if (action) {
                  let card = { title: block.name ?? '', lines: [] as string[] };
                  try {
                    card = JSON.parse(action.cardJson) as { title: string; lines: string[] };
                  } catch {
                    /* 카드 파싱 실패 시 tool 이름으로 대체 */
                  }
                  const badge = STATUS_BADGE[action.status] ?? { label: action.status, variant: 'outline' as const };
                  return (
                    <div key={key} className="w-full max-w-md self-start rounded-lg border bg-muted/30 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <ShieldQuestion className="size-4" /> {card.title}
                        </div>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      {card.lines.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted-foreground">
                          {card.lines.map((line, lineIndex) => (
                            <p key={lineIndex} className="whitespace-pre-wrap">{line}</p>
                          ))}
                        </div>
                      )}
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">실행 상세</summary>
                        <div className="mt-2 flex flex-col gap-2">
                          <div>
                            <p className="mb-1 font-medium text-muted-foreground">
                              입력 <span className="font-mono">({block.name})</span>
                            </p>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(block.input, null, 1)}</pre>
                          </div>
                          {result && (
                            <div>
                              <p className={`mb-1 font-medium ${result.is_error ? 'text-destructive' : 'text-muted-foreground'}`}>결과</p>
                              <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono">{result.content}</pre>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  );
                }
                return (
                  <details key={key} className="self-start rounded-md border px-3 py-2 text-xs">
                    <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                      <Wrench className="size-3" />
                      <span className="font-mono">{block.name}</span>
                      {result?.is_error && <Badge variant="destructive">오류</Badge>}
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <div>
                        <p className="mb-1 font-medium text-muted-foreground">입력</p>
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(block.input, null, 1)}</pre>
                      </div>
                      {result && (
                        <div>
                          <p className={`mb-1 font-medium ${result.is_error ? 'text-destructive' : 'text-muted-foreground'}`}>결과</p>
                          <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono">{result.content}</pre>
                        </div>
                      )}
                    </div>
                  </details>
                );
              }
              if (block.type === 'web_search') {
                return (
                  <div key={key} className="flex items-center gap-1.5 self-start text-xs text-muted-foreground">
                    <Wrench className="size-3" /> 웹 검색{block.query ? `: ${block.query}` : ''}
                  </div>
                );
              }
              //  tool_result 는 호출 블록에 합쳐 그렸다
              return null;
            })
            .filter(Boolean);

          if (rendered.length === 0 && !usage) return null;
          return (
            <div key={message.id} className="flex flex-col gap-1.5">
              {rendered}
              {usage && (
                //  이 턴의 청구 내역 — 어느 항목·모델로 얼마가 나갔는지 채팅에 붙여 보인다
                <span className="self-start text-[11px] text-muted-foreground">
                  {time(usage.createdAt)} · {usage.entryName ?? usage.provider} · <span className="font-mono">{usage.model}</span> · 입력{' '}
                  {usage.inputTokens.toLocaleString('ko-KR')} · 출력 {usage.outputTokens.toLocaleString('ko-KR')}
                  {usage.cacheReadTokens > 0 && <> · 캐시 {usage.cacheReadTokens.toLocaleString('ko-KR')}</>}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span>
          입력 <b>{totalIn.toLocaleString('ko-KR')}</b>
        </span>
        <span>
          출력 <b>{totalOut.toLocaleString('ko-KR')}</b>
        </span>
        <span>
          캐시 읽기 <b>{totalCache.toLocaleString('ko-KR')}</b>
        </span>
        <span>
          합계 <b>{(totalIn + totalOut).toLocaleString('ko-KR')}</b>
        </span>
        <span className="text-muted-foreground">요청 {data.usages.length}회</span>
      </div>
    </div>
  );
}
