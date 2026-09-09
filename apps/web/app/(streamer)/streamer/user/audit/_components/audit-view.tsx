'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  auditColumnCount,
  AuditHeaderRow,
  AuditMessageRow,
  AuditRow,
  AuditSkeletonRow,
} from '@/components/audit-log-rows';
import { SearchInput } from '@/components/data-table/search-input';
import { TablePagination } from '@/components/data-table/table-controls';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableHeader } from '@/components/ui/table';
import { pageOf, useSearchState } from '@/src/hooks/use-search-state';
import { useTRPC } from '@/src/utils/trpc-react';

const COLUMNS = auditColumnCount(false);

type ActorType = 'STREAMER' | 'ADMIN' | 'CHATBOT' | 'AGENT';
const ACTOR_OPTIONS: { value: ActorType; label: string }[] = [
  { value: 'STREAMER', label: '본인' },
  { value: 'ADMIN', label: '관리자' },
  { value: 'CHATBOT', label: '채팅 명령' },
  { value: 'AGENT', label: '에이전트' },
];
const PERIODS = [
  { value: 'all', label: '전체 기간' },
  { value: '7', label: '최근 7일' },
  { value: '30', label: '최근 30일' },
  { value: '90', label: '최근 90일' },
];
const PAGE_SIZES = ['20', '50', '100'];

/** URL 쿼리 상태 (#265) — 기본값은 주소에서 생략된다 */
const DEFAULTS = { page: '1', size: '50', q: '', actor: 'ALL', days: 'all' };

/**
 * 설정 변경 기록 (#175). 본인 변경·어드민 대행(#71)·챗봇 명령이 전부 같은 목록에 남는다 —
 * 관리자가 무엇을 바꿨는지 스트리머에게 그대로 보이는 투명성 장치다. 어드민 대행 콘솔에도 같은 화면이 뜬다.
 * 로그인과 관리자 대행 시작/종료 같은 접근 기록(#254)도 같은 목록에 「접근」 표시로 남는다.
 *
 * 페이지 버튼 + 검색·행위자·기간 필터 (#265). 상태는 전부 URL 에 — 새로고침·뒤로가기·링크 공유에 위치가 남는다.
 */
export function AuditView() {
  const trpc = useTRPC();
  const [state, setState] = useSearchState(DEFAULTS);
  const page = pageOf(state.page);
  const perPage = PAGE_SIZES.includes(state.size) ? Number(state.size) : 50;
  const isFiltered = state.q !== '' || state.actor !== 'ALL' || state.days !== 'all';

  const { data, isPending, error } = useQuery(
    trpc.audit.logs.queryOptions(
      {
        page,
        perPage,
        q: state.q || undefined,
        actorType: state.actor === 'ALL' ? undefined : (state.actor as ActorType),
        days: state.days === 'all' ? undefined : Number(state.days),
      },
      { placeholderData: keepPreviousData },
    ),
  );

  /** 필터가 바뀌면 1페이지로 */
  const setFilter = (patch: Partial<typeof DEFAULTS>) => setState({ ...patch, page: '1' });

  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-muted-foreground">
        설정을 바꾼 기록입니다. 본인뿐 아니라 관리자가 대신 바꾼 것, 채팅 명령(!추가 등)으로 바뀐 것도 남습니다.
        로그인과 관리자가 이 콘솔을 대신 연 기록도 함께 남습니다.
        재생 조작과 대기열에 곡을 넣고 뺀 것은 기록하지 않습니다 (재생 기록에 남습니다).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={state.q}
          onChange={(q) => setFilter({ q })}
          placeholder="변경 항목·내용·닉네임 검색"
          className="max-w-64"
        />
        <Select value={state.actor} onValueChange={(actor) => setFilter({ actor })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 행위자</SelectItem>
            {ACTOR_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={state.days} onValueChange={(days) => setFilter({ days })}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((period) => (
              <SelectItem key={period.value} value={period.value}>{period.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFiltered && (
          <Button type="button" variant="ghost" onClick={() => setFilter({ q: '', actor: 'ALL', days: 'all' })}>
            초기화
          </Button>
        )}
        <Select value={String(perPage)} onValueChange={(size) => setFilter({ size })}>
          <SelectTrigger className="ml-auto w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={size}>{size}건씩</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <AuditHeaderRow />
          </TableHeader>
          <TableBody>
            {isPending ? (
              <AuditSkeletonRow colSpan={COLUMNS} />
            ) : error ? (
              <AuditMessageRow colSpan={COLUMNS}>기록을 불러오지 못했습니다: {error.message}</AuditMessageRow>
            ) : data.logs.length === 0 ? (
              <AuditMessageRow colSpan={COLUMNS} tall>
                {isFiltered ? '조건에 맞는 기록이 없습니다.' : '아직 기록이 없습니다.'}
              </AuditMessageRow>
            ) : (
              data.logs.map((log) => <AuditRow key={log.id} log={log} />)
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <TablePagination
          page={page}
          perPage={perPage}
          total={data.total}
          onPage={(next) => setState({ page: String(next) }, { history: 'push' })}
        />
      )}
    </div>
  );
}
