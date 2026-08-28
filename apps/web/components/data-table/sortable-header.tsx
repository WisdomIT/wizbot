'use client';

import { ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

/** 정렬 API 만 구조적으로 요구한다 — 컬럼 제네릭(TFeatures·TData·TValue)을 여기까지 끌고 오지 않기 위해 */
interface SortableColumn {
  toggleSorting: (desc?: boolean) => void;
  getIsSorted: () => false | 'asc' | 'desc';
}

/** 클릭하면 정렬이 바뀌는 헤더. `header: ({ column }) => <SortableHeader column={column}>이름</SortableHeader>` */
export function SortableHeader({ column, children }: { column: SortableColumn; children: ReactNode }) {
  return (
    <Button
      variant="ghost"
      className="-mx-3"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {children}
      <ArrowUpDown className="h-4 w-4" />
    </Button>
  );
}
