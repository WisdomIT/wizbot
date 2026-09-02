'use client';

import { useQuery } from '@tanstack/react-query';
import { ShieldQuestion, Wrench } from 'lucide-react';

import Markdown from '@/components/custom/markdown';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 대화 상세 (#35 조정 6, pelican conversation 뷰 이식) — 메시지 전문에 tool 호출의
 * 입력·결과까지 전부 펼쳐 보이고, 하단에 요청별 토큰·프로바이더와 합계를 붙인다.
 */

type Block =
  | { type: 'text'; text?: string }
  | { type: 'tool_use'; id?: string; name?: string; input?: unknown }
  | { type: 'tool_result'; tool_use_id?: string; content?: string; is_error?: boolean }
  | { type: 'web_search'; query?: string };

const STATUS_LABEL: Record<string, string> = { PENDING: '대기', APPROVED: '승인됨', DECLINED: '거절됨', EXPIRED: '만료됨' };

export function AgentLogView({ id }: { id: number }) {
  const trpc = useTRPC();
  const { data, error, isPending } = useQuery(trpc.agent.adminConversation.queryOptions({ id }));

  if (isPending) return <Skeleton className="mt-4 h-96 w-full" />;
  if (error || !data) return <p className="py-8 text-sm text-muted-foreground">대화를 불러오지 못했습니다: {error?.message}</p>;

  const actionByToolUse = new Map(data.actions.map((action) => [action.toolUseId, action]));
  const totalIn = data.usages.reduce((sum, row) => sum + row.inputTokens, 0);
  const totalOut = data.usages.reduce((sum, row) => sum + row.outputTokens, 0);
  const totalCache = data.usages.reduce((sum, row) => sum + row.cacheReadTokens, 0);

  return (
    <div className="flex max-w-3xl flex-col gap-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{data.title}</h2>
        {data.deleted && <Badge variant="secondary">삭제됨</Badge>}
        <span className="text-sm text-muted-foreground">
          {data.channelName} · {new Date(data.createdAt).toLocaleString('ko-KR')}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {data.messages.map((message) => {
          let blocks: Block[] = [];
          try {
            const parsed = JSON.parse(message.contentJson) as unknown;
            blocks = Array.isArray(parsed) ? (parsed as Block[]) : [{ type: 'text', text: String(parsed) }];
          } catch {
            /* 형식이 깨진 행은 건너뛴다 */
          }
          return blocks.map((block, index) => {
            const key = `${message.id}-${index}`;
            if (block.type === 'text' && block.text) {
              return message.role === 'user' ? (
                <div key={key} className="ml-16 self-end whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {block.text}
                </div>
              ) : (
                <div key={key} className="prose prose-sm dark:prose-invert mr-16 max-w-none self-start rounded-lg bg-muted px-3 py-2 text-sm">
                  <Markdown>{block.text}</Markdown>
                </div>
              );
            }
            if (block.type === 'tool_use') {
              const action = block.id ? actionByToolUse.get(block.id) : undefined;
              return (
                <details key={key} className="self-start rounded-md border px-3 py-2 text-xs">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-muted-foreground">
                    {action ? <ShieldQuestion className="size-3" /> : <Wrench className="size-3" />}
                    <span className="font-mono">{block.name}</span>
                    {action && <Badge variant="outline">{STATUS_LABEL[action.status] ?? action.status}</Badge>}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">{JSON.stringify(block.input, null, 1)}</pre>
                </details>
              );
            }
            if (block.type === 'tool_result') {
              return (
                <details key={key} className="self-start rounded-md border border-dashed px-3 py-2 text-xs">
                  <summary className={`cursor-pointer ${block.is_error ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                    결과{block.is_error ? ' (오류)' : ''}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono">{block.content}</pre>
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
            return null;
          });
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
      </div>

      {data.usages.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>시각</TableHead>
              <TableHead>모델</TableHead>
              <TableHead className="text-right">입력</TableHead>
              <TableHead className="text-right">출력</TableHead>
              <TableHead className="text-right">캐시</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.usages.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(row.createdAt).toLocaleString('ko-KR')}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {row.entryName ?? row.provider} · <span className="font-mono">{row.model}</span>
                </TableCell>
                <TableCell className="text-right">{row.inputTokens.toLocaleString('ko-KR')}</TableCell>
                <TableCell className="text-right">{row.outputTokens.toLocaleString('ko-KR')}</TableCell>
                <TableCell className="text-right">{row.cacheReadTokens.toLocaleString('ko-KR')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
