'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

import { SortableHead, TablePagination } from '../../_components/table-controls';

/**
 * 사용자별 통계 (#35, pelican UsageStats 이식) — 토큰을 전체/1일/7일/30일 윈도우 컬럼으로,
 * 어느 컬럼으로든 정렬. 이름 검색·페이지네이션. 행 클릭 → 그 사용자로 로그 필터.
 */

type Sort = 'name' | 'messages' | 'total' | 'd1' | 'd7' | 'd30';
const PER_PAGE = 20;

export function AgentUsersView() {
  const trpc = useTRPC();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('total');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data, isPending } = useQuery(
    trpc.agent.adminUserStats.queryOptions({ query: query || null, sort, order, page, perPage: PER_PAGE }),
  );

  function handleSort(key: Sort) {
    if (sort === key) setOrder(order === 'desc' ? 'asc' : 'desc');
    else {
      setSort(key);
      setOrder(key === 'name' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-3 py-4">
      <Input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
        placeholder="사용자명 검색"
        className="max-w-60"
      />
      {isPending || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="스트리머" sortKey="name" sort={sort} order={order} onSort={handleSort} />
                <SortableHead label="채팅 수" sortKey="messages" sort={sort} order={order} onSort={handleSort} className="text-right" />
                <SortableHead label="토큰 전체" sortKey="total" sort={sort} order={order} onSort={handleSort} className="text-right" />
                <SortableHead label="1일" sortKey="d1" sort={sort} order={order} onSort={handleSort} className="text-right" />
                <SortableHead label="7일" sortKey="d7" sort={sort} order={order} onSort={handleSort} className="text-right" />
                <SortableHead label="30일" sortKey="d30" sort={sort} order={order} onSort={handleSort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    사용 기록이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {data.rows.map((row) => (
                <TableRow key={row.userId}>
                  <TableCell>
                    {/* 그 사용자의 대화만 보이는 로그로 — pelican 의 행 클릭 → 로그 필터 이동 */}
                    <Link href={`/admin/agent/logs?user=${encodeURIComponent(row.channelName)}`} className="hover:underline">
                      {row.channelName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{row.messages.toLocaleString('ko-KR')}</TableCell>
                  <TableCell className="text-right">{row.total.toLocaleString('ko-KR')}</TableCell>
                  <TableCell className="text-right">{row.d1.toLocaleString('ko-KR')}</TableCell>
                  <TableCell className="text-right">{row.d7.toLocaleString('ko-KR')}</TableCell>
                  <TableCell className="text-right">{row.d30.toLocaleString('ko-KR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} perPage={PER_PAGE} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
