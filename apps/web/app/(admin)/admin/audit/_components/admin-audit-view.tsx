'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ACCESS_AUDIT_LABELS, AUDIT_LABELS, CHAT_AUDIT_LABELS } from '@wizbot/shared/lib/audit';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableHeader } from '@/components/ui/table';
import { pageOf, useSearchState } from '@/src/hooks/use-search-state';
import { useTRPC } from '@/src/utils/trpc-react';

const COLUMNS = auditColumnCount(true);
/** Radix Select 는 빈 문자열 값을 못 쓴다 — 「전체」 항목의 값 */
const ALL = 'ALL';
const PAGE_SIZES = ['20', '50', '100'];

type ActorType = 'STREAMER' | 'ADMIN' | 'CHATBOT' | 'AGENT';
type Kind = 'change' | 'access';

const ACTOR_OPTIONS: { value: ActorType; label: string }[] = [
  { value: 'STREAMER', label: '스트리머 본인' },
  { value: 'ADMIN', label: '관리자' },
  { value: 'CHATBOT', label: '채팅 명령' },
  { value: 'AGENT', label: '에이전트' },
];

const PROCEDURE_GROUPS: { label: string; items: Record<string, string> }[] = [
  { label: '접근', items: ACCESS_AUDIT_LABELS },
  { label: '설정 변경', items: AUDIT_LABELS },
  { label: '채팅 명령', items: CHAT_AUDIT_LABELS },
];

/** 날짜 입력(YYYY-MM-DD, 브라우저 로컬)을 그날의 시작·끝으로 */
function startOfDay(date: string): Date | undefined {
  return date ? new Date(`${date}T00:00:00`) : undefined;
}
function endOfDay(date: string): Date | undefined {
  return date ? new Date(`${date}T23:59:59.999`) : undefined;
}

/** URL 쿼리 상태 (#265) — 기본값은 주소에서 생략된다 */
const DEFAULTS = { page: '1', size: '50', q: '', user: ALL, actor: ALL, kind: ALL, proc: ALL, from: '', to: '' };
const FILTER_KEYS = ['q', 'user', 'actor', 'kind', 'proc', 'from', 'to'] as const;

/**
 * 어드민 감사 기록 (#254). 모든 채널의 설정 변경 기록(#175)과 접근 기록(로그인·대행 시작/종료)을
 * 한 목록에서 본다. 페이지 버튼 + 키워드 검색 (#265), 상태는 전부 URL 에.
 */
export function AdminAuditView() {
  const trpc = useTRPC();
  const streamers = useQuery(trpc.admin.listStreamers.queryOptions());
  const [state, setState] = useSearchState(DEFAULTS);
  const page = pageOf(state.page);
  const perPage = PAGE_SIZES.includes(state.size) ? Number(state.size) : 50;
  const isFiltered = FILTER_KEYS.some((key) => state[key] !== DEFAULTS[key]);

  const { data, isPending, error } = useQuery(
    trpc.audit.adminLogs.queryOptions(
      {
        page,
        perPage,
        q: state.q || undefined,
        userId: state.user === ALL ? undefined : Number(state.user),
        actorType: state.actor === ALL ? undefined : (state.actor as ActorType),
        kind: state.kind === ALL ? undefined : (state.kind as Kind),
        procedure: state.proc === ALL ? undefined : state.proc,
        from: startOfDay(state.from),
        to: endOfDay(state.to),
      },
      { placeholderData: keepPreviousData },
    ),
  );

  /** 필터가 바뀌면 1페이지로 */
  const setFilter = (patch: Partial<typeof DEFAULTS>) => setState({ ...patch, page: '1' });
  const reset = () => setFilter(Object.fromEntries(FILTER_KEYS.map((key) => [key, DEFAULTS[key]])));

  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-muted-foreground">
        모든 채널의 설정 변경 기록과 접근 기록(로그인·관리자 대행 시작/종료)입니다.
        내용을 누르면 기록된 입력 전체를 볼 수 있습니다. 토큰류 값은 기록 시점에 이미 가려져 있습니다.
        스트리머가 탈퇴하면 설정 변경 기록은 함께 지워지고 접근 기록만 「탈퇴」 표시로 남습니다. 접속지 IP 는 수집하지 않습니다.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <FilterField label="검색">
          <SearchInput
            value={state.q}
            onChange={(q) => setFilter({ q })}
            placeholder="변경 항목·내용·닉네임"
            className="w-56"
          />
        </FilterField>
        <FilterField label="채널">
          <Select value={state.user} onValueChange={(user) => setFilter({ user })}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 채널</SelectItem>
              {streamers.data?.map((streamer) => (
                <SelectItem key={streamer.id} value={String(streamer.id)}>{streamer.channelName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="행위자">
          <Select value={state.actor} onValueChange={(actor) => setFilter({ actor })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 행위자</SelectItem>
              {ACTOR_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="종류">
          <Select value={state.kind} onValueChange={(kind) => setFilter({ kind })} disabled={state.proc !== ALL}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              <SelectItem value="change">변경</SelectItem>
              <SelectItem value="access">접근</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="항목">
          <Select value={state.proc} onValueChange={(proc) => setFilter({ proc })}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 항목</SelectItem>
              {PROCEDURE_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {Object.entries(group.items).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="시작일">
          <Input type="date" value={state.from} max={state.to || undefined} onChange={(event) => setFilter({ from: event.target.value })} className="w-40" />
        </FilterField>
        <FilterField label="종료일">
          <Input type="date" value={state.to} min={state.from || undefined} onChange={(event) => setFilter({ to: event.target.value })} className="w-40" />
        </FilterField>
        {isFiltered && (
          <Button type="button" variant="ghost" onClick={reset}>초기화</Button>
        )}
        <FilterField label="표시">
          <Select value={String(perPage)} onValueChange={(size) => setFilter({ size })}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={size}>{size}건씩</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <AuditHeaderRow showChannel />
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
              data.logs.map((log) => <AuditRow key={log.id} log={log} showChannel />)
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
