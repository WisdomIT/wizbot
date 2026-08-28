import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  createTableHook,
  filterFns,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
} from '@tanstack/react-table';

/**
 * 사이트의 모든 테이블이 쓰는 기능 세트 (#139).
 *
 * v9 는 기능이 opt-in 이라 정렬·필터·페이지네이션을 여기서 한 번 고른다.
 * `createTableHook` 이 이 기능 세트를 타입에 묶어 주므로, 컬럼 정의 쪽에서는
 * `createColumnHelper<TData>()` 만 부르면 되고 TFeatures 를 다시 적을 일이 없다.
 *
 * `filterFns` / `sortFns` 를 넘겨야 컬럼의 `filterFn: 'auto'`(기본값)가 문자열 컬럼에서
 * includesString 을 고른다 — 안 넘기면 등록된 함수가 없어 필터가 동작하지 않는다.
 */
export const tableFeatureSet = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns,
  sortFns,
});

const hook = createTableHook({ features: tableFeatureSet });

/** 기능 세트가 묶인 테이블 훅 — `useTable` 대신 이것을 쓴다 */
export const useAppTable = hook.useAppTable;
/** 기능 세트가 묶인 컬럼 헬퍼 — `columns.tsx` 에서 `createColumnHelper<Row>()` */
export const createColumnHelper = hook.createAppColumnHelper;
