'use client';

import type { ColumnDef, RowData } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

import { tableFeatureSet, useAppTable } from './table';

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
 */
export function DataTable<TData extends RowData>({
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
  //  상태를 밖에서 들고 있을 이유가 없다 — 테이블이 자기 상태를 갖는다
  const table = useAppTable({
    columns,
    data,
    initialState: { pagination: { pageIndex: 0, pageSize } },
  });

  const filter = filterColumn ? table.getColumn(filterColumn) : undefined;
  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();

  return (
    <>
      <div className={className}>
        <div
          className={cn(
            'flex items-center gap-2 py-4',
            filter ? 'justify-between' : 'justify-end',
          )}
        >
          {filter && (
            <Input
              placeholder={filterPlaceholder}
              value={(filter.getFilterValue() as string | undefined) ?? ''}
              onChange={(event) => filter.setFilterValue(event.target.value)}
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
