'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { SearchInput } from '@/components/data-table/search-input';
import { SortableHead, TablePagination } from '@/components/data-table/table-controls';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pageOf, useSearchState } from '@/src/hooks/use-search-state';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 사용자별 통계 (#35, pelican UsageStats 이식) — 토큰을 전체/1일/7일/30일 윈도우 컬럼으로,
 * 어느 컬럼으로든 정렬. 이름 검색·페이지네이션. 행 클릭 → 그 사용자로 로그 필터. 상태는 전부 URL 쿼리 (#265).
 */

type Sort = 'name' | 'messages' | 'total' | 'd1' | 'd7' | 'd30';
const SORTS: Sort[] = ['name', 'messages', 'total', 'd1', 'd7', 'd30'];
const PER_PAGE = 20;
const DEFAULTS = { page: '1', q: '', sort: 'total', order: 'desc' };

export function AgentUsersView() {
  const trpc = useTRPC();
  const [state, setState] = useSearchState(DEFAULTS);
  const page = pageOf(state.page);
  const sort: Sort = SORTS.includes(state.sort as Sort) ? (state.sort as Sort) : 'total';
  const order = state.order === 'asc' ? 'asc' : 'desc';

  const { data, isPending } = useQuery(
    trpc.agent.adminUserStats.queryOptions(
      { query: state.q || null, sort, order, page, perPage: PER_PAGE },
      { placeholderData: keepPreviousData },
    ),
  );

  /** 검색·정렬이 바뀌면 1페이지로 */
  const setFilter = (patch: Partial<typeof DEFAULTS>) => setState({ ...patch, page: '1' });

  function handleSort(key: Sort) {
    if (sort === key) setFilter({ order: order === 'desc' ? 'asc' : 'desc' });
    else setFilter({ sort: key, order: key === 'name' ? 'asc' : 'desc' });
  }

  return (
    <div className="flex max-w-4xl flex-col gap-3 py-4">
      <SearchInput value={state.q} onChange={(q) => setFilter({ q })} placeholder="사용자명 검색" className="max-w-60" />
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
          <TablePagination page={page} perPage={PER_PAGE} total={data.total} onPage={(next) => setState({ page: String(next) }, { history: 'push' })} />
        </>
      )}
    </div>
  );
}
