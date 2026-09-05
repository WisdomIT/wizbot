'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

import { SortableHead, TablePagination } from '../../_components/table-controls';

/**
 * 에이전트 대화 로그 (#35, pelican UsageResource 이식) — soft delete 「삭제됨」 포함,
 * 사용자·제목·대화 내용 검색, 기간 필터, 시각/메시지/토큰 정렬, 페이지네이션.
 */

type Sort = 'recent' | 'messages' | 'input' | 'output';
const PER_PAGE = 20;
const PERIODS = [
  { value: 'all', label: '전체 기간', days: null },
  { value: '1', label: '오늘', days: 1 },
  { value: '7', label: '최근 7일', days: 7 },
  { value: '30', label: '최근 30일', days: 30 },
] as const;

export function AgentLogsView() {
  const trpc = useTRPC();
  //  사용자 탭에서 행을 누르면 ?user= 로 넘어온다
  const initialUser = useSearchParams().get('user') ?? '';
  const [user, setUser] = useState(initialUser);
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<(typeof PERIODS)[number]['value']>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const days = PERIODS.find((preset) => preset.value === period)?.days ?? null;
  const { data, isPending } = useQuery(
    trpc.agent.adminConversations.queryOptions({
      query: query || null,
      user: user || null,
      days,
      sort,
      order,
      page,
      perPage: PER_PAGE,
    }),
  );

  function handleSort(key: Sort) {
    if (sort === key) setOrder(order === 'desc' ? 'asc' : 'desc');
    else {
      setSort(key);
      setOrder('desc');
    }
    setPage(1);
  }

  return (
    <div className="flex max-w-5xl flex-col gap-3 py-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="제목·대화 내용·사용자 검색"
          className="max-w-64"
        />
        <Input
          value={user}
          onChange={(event) => {
            setUser(event.target.value);
            setPage(1);
          }}
          placeholder="사용자 필터"
          className="max-w-40"
        />
        <Select
          value={period}
          onValueChange={(value) => {
            setPeriod(value as typeof period);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isPending || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="시작" sortKey="recent" sort={sort} order={order} onSort={handleSort} />
                <TableHead>스트리머</TableHead>
                <TableHead>제목</TableHead>
                <SortableHead label="메시지" sortKey="messages" sort={sort} order={order} onSort={handleSort} className="text-right" />
                <SortableHead label="입력 토큰" sortKey="input" sort={sort} order={order} onSort={handleSort} className="text-right" />
                <SortableHead label="출력 토큰" sortKey="output" sort={sort} order={order} onSort={handleSort} className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    조건에 맞는 대화가 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{row.channelName}</TableCell>
                  <TableCell className="max-w-72">
                    <Link href={`/admin/agent/logs/${row.id}`} className="flex items-center gap-2 hover:underline">
                      <span className="truncate">{row.title}</span>
                      {row.deleted && <Badge variant="secondary">삭제됨</Badge>}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{row.messageCount}</TableCell>
                  <TableCell className="text-right">{row.inputTokens.toLocaleString('ko-KR')}</TableCell>
                  <TableCell className="text-right">{row.outputTokens.toLocaleString('ko-KR')}</TableCell>
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
