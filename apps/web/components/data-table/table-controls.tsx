'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/** 정렬 가능한 헤더 — 클릭으로 컬럼 정렬·방향 토글 (pelican 테이블과 같은 동작) */
export function SortableHead<Key extends string>({
  label,
  sortKey,
  sort,
  order,
  onSort,
  className,
}: {
  label: string;
  sortKey: Key;
  sort: Key;
  order: 'asc' | 'desc';
  onSort: (key: Key) => void;
  className?: string;
}) {
  const active = sort === sortKey;
  return (
    <TableHead className={className}>
      <button type="button" className={cn('inline-flex items-center gap-1 hover:text-foreground', active && 'text-foreground')} onClick={() => onSort(sortKey)}>
        {label}
        {active && (order === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />)}
      </button>
    </TableHead>
  );
}

/** 페이지네이션 — 이전/다음 + 페이지 번호(현재 주변), 총 건수 */
export function TablePagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(Math.ceil(total / perPage), 1);
  const numbers: number[] = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) numbers.push(i);
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs text-muted-foreground">총 {total.toLocaleString('ko-KR')}건</span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          이전
        </Button>
        {numbers[0] !== 1 && <span className="px-1 text-xs text-muted-foreground">…</span>}
        {numbers.map((number) => (
          <Button key={number} size="sm" variant={number === page ? 'default' : 'ghost'} className="size-8 p-0" onClick={() => onPage(number)}>
            {number}
          </Button>
        ))}
        {numbers[numbers.length - 1] !== totalPages && <span className="px-1 text-xs text-muted-foreground">…</span>}
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          다음
        </Button>
      </div>
    </div>
  );
}
