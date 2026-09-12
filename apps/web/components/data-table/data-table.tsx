'use client';

import type { ColumnDef, ColumnFiltersState, PaginationState, RowData } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, Suspense } from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { pageOf, useSearchState } from '@/src/hooks/use-search-state';

import { SearchInput } from './search-input';
import { tableFeatureSet, useAppTable } from './table';

/** URL 쿼리 상태 (#265) — `?q=` 검색어, `?page=` 페이지. 기본값은 주소에서 생략된다 */
const SEARCH_DEFAULTS = { q: '', page: '1' };

type Features = typeof tableFeatureSet;

interface DataTableProps<TData extends RowData> {
  columns: ColumnDef<Features, TData, any>[];
  data: TData[];
  /** 검색창이 걸리는 컬럼 id. 없으면 검색창을 그리지 않는다 */
  filterColumn?: string;
  filterPlaceholder?: string;
  /** 검색창 오른쪽(검색창이 없으면 오른쪽 정렬)에 놓는 버튼들 */
  toolbar?: ReactNode;
  /** 행 수 표시의 단위 — "N개 {unit}" */
  unit: string;
  emptyText: string;
  pageSize?: number;
  rowClassName?: (row: TData) => string | undefined;
  className?: string;
  /** 테이블 뒤에 붙는 다이얼로그 등 */
  children?: ReactNode;
}

/**
 * 정렬·필터·페이지네이션이 붙은 공용 테이블 (#139).
 *
 * 네 화면(스트리머 목록·명령어·반복·시청자용 명령어)이 각자 140줄짜리 사본을 갖고 있었다.
 * 갈리는 건 툴바·빈 문구·단위·행 스타일뿐이라 그것만 props 로 받는다.
 * 검색어·페이지는 URL 쿼리에 둔다 (#265) — useSearchParams 라 Suspense 경계를 여기서 친다.
 */
export function DataTable<TData extends RowData>(props: DataTableProps<TData>) {
  return (
    <Suspense>
      <DataTableInner {...props} />
    </Suspense>
  );
}

function DataTableInner<TData extends RowData>({
  columns,
  data,
  filterColumn,
  filterPlaceholder,
  toolbar,
  unit,
  emptyText,
  pageSize = 20,
  rowClassName,
  className,
  children,
}: DataTableProps<TData>) {
  const [search, setSearch] = useSearchState(SEARCH_DEFAULTS);
  const pagination: PaginationState = { pageIndex: pageOf(search.page) - 1, pageSize };
  const columnFilters: ColumnFiltersState = filterColumn && search.q ? [{ id: filterColumn, value: search.q }] : [];

  //  정렬은 테이블이 갖고, 검색어·페이지는 URL 이 갖는다 (controlled)
  const table = useAppTable({
    columns,
    data,
    state: { pagination, columnFilters },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater(pagination) : updater;
      if (next.pageIndex !== pagination.pageIndex) {
        setSearch({ page: String(next.pageIndex + 1) }, { history: 'push' });
      }
    },
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater;
      const value = next.find((item) => item.id === filterColumn)?.value;
      setSearch({ q: typeof value === 'string' ? value : '', page: '1' });
    },
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <>
      <div className={className}>
        <div
          className={cn(
            'flex items-center gap-2 py-4',
            filterColumn ? 'justify-between' : 'justify-end',
          )}
        >
          {filterColumn && (
            <SearchInput
              placeholder={filterPlaceholder}
              value={search.q}
              onChange={(q) => setSearch({ q, page: '1' })}
              className="max-w-sm"
            />
          )}
          {toolbar}
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow key={row.id} className={rowClassName?.(row.original)}>
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {emptyText}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-sm text-muted-foreground">
            {table.getFilteredRowModel().rows.length}개 {unit} / {pageCount}페이지 중
            {pageCount > 0 ? ` ${table.state.pagination.pageIndex + 1}페이지` : ''}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
