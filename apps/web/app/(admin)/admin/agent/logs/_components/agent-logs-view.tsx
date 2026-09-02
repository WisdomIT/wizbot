'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 에이전트 대화 로그 (#35 조정 6) — 전체 스트리머, soft delete 된 대화도 「삭제됨」으로 남는다.
 * 커서 배열 페이지네이션(#175 감사 로그와 같은 패턴 — infiniteQuery 는 TS2589).
 */
export function AgentLogsView() {
  const trpc = useTRPC();
  const [cursors, setCursors] = useState<(number | null)[]>([null]);

  return (
    <div className="flex max-w-4xl flex-col gap-2 py-4">
      {cursors.map((cursor, index) => (
        <LogsPage
          key={cursor ?? 'first'}
          cursor={cursor}
          isLast={index === cursors.length - 1}
          onMore={(next) => setCursors((prev) => [...prev, next])}
        />
      ))}
    </div>
  );
}

function LogsPage({ cursor, isLast, onMore }: { cursor: number | null; isLast: boolean; onMore: (next: number) => void }) {
  const trpc = useTRPC();
  const { data, isPending } = useQuery(trpc.agent.adminConversations.queryOptions({ cursor, limit: 30 }));

  if (isPending || !data) return <Skeleton className="h-40 w-full" />;
  if (cursor === null && data.conversations.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">아직 대화가 없습니다.</p>;
  }

  return (
    <>
      <Table>
        {cursor === null && (
          <TableHeader>
            <TableRow>
              <TableHead>스트리머</TableHead>
              <TableHead>제목</TableHead>
              <TableHead className="text-right">메시지</TableHead>
              <TableHead className="text-right">토큰</TableHead>
              <TableHead className="text-right">마지막 활동</TableHead>
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {data.conversations.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{row.channelName}</TableCell>
              <TableCell className="max-w-64">
                <Link href={`/admin/agent/logs/${row.id}`} className="flex items-center gap-2 hover:underline">
                  <span className="truncate">{row.title}</span>
                  {row.deleted && <Badge variant="secondary">삭제됨</Badge>}
                </Link>
              </TableCell>
              <TableCell className="text-right">{row.messageCount}</TableCell>
              <TableCell className="text-right">{row.tokens.toLocaleString('ko-KR')}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                {new Date(row.updatedAt).toLocaleString('ko-KR')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {isLast && data.nextCursor !== null && (
        <div className="flex justify-center py-2">
          <Button variant="outline" size="sm" onClick={() => onMore(data.nextCursor!)}>
            더 보기
          </Button>
        </div>
      )}
    </>
  );
}
