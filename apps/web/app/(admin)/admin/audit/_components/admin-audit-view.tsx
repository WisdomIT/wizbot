'use client';

import { useQuery } from '@tanstack/react-query';
import { ACCESS_AUDIT_LABELS, AUDIT_LABELS, CHAT_AUDIT_LABELS } from '@wizbot/shared/lib/audit';
import { useState } from 'react';

import {
  auditColumnCount,
  AuditHeaderRow,
  AuditMessageRow,
  AuditMoreRow,
  AuditRow,
  AuditSkeletonRow,
} from '@/components/audit-log-rows';
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
import { useTRPC } from '@/src/utils/trpc-react';

const PAGE_SIZE = 50;
const COLUMNS = auditColumnCount(true);
/** Radix Select 는 빈 문자열 값을 못 쓴다 — 「전체」 항목의 값 */
const ALL = 'ALL';

type ActorType = 'STREAMER' | 'ADMIN' | 'CHATBOT' | 'AGENT';
type Kind = 'change' | 'access';

interface Filters {
  userId?: number;
  actorType?: ActorType;
  kind?: Kind;
  procedure?: string;
  from?: Date;
  to?: Date;
}

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

/**
 * 어드민 감사 기록 (#254). 모든 채널의 설정 변경 기록(#175)과 접근 기록(로그인·대행 시작/종료)을
 * 한 목록에서 본다. 필터를 바꾸면 커서 목록을 처음부터 다시 시작한다 (키로 리셋).
 */
export function AdminAuditView() {
  const trpc = useTRPC();
  const streamers = useQuery(trpc.admin.listStreamers.queryOptions());

  const [userId, setUserId] = useState(ALL);
  const [actorType, setActorType] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [procedure, setProcedure] = useState(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters: Filters = {
    userId: userId === ALL ? undefined : Number(userId),
    actorType: actorType === ALL ? undefined : (actorType as ActorType),
    kind: kind === ALL ? undefined : (kind as Kind),
    procedure: procedure === ALL ? undefined : procedure,
    from: startOfDay(from),
    to: endOfDay(to),
  };
  const filterKey = JSON.stringify([userId, actorType, kind, procedure, from, to]);
  const isFiltered = userId !== ALL || actorType !== ALL || kind !== ALL || procedure !== ALL || from !== '' || to !== '';

  function reset() {
    setUserId(ALL);
    setActorType(ALL);
    setKind(ALL);
    setProcedure(ALL);
    setFrom('');
    setTo('');
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-muted-foreground">
        모든 채널의 설정 변경 기록과 접근 기록(로그인·관리자 대행 시작/종료)입니다.
        내용을 누르면 기록된 입력 전체를 볼 수 있습니다. 토큰류 값은 기록 시점에 이미 가려져 있습니다.
        접속지 IP 는 수집하지 않습니다.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <FilterField label="채널">
          <Select value={userId} onValueChange={setUserId}>
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
          <Select value={actorType} onValueChange={setActorType}>
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
          <Select value={kind} onValueChange={setKind} disabled={procedure !== ALL}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              <SelectItem value="change">변경</SelectItem>
              <SelectItem value="access">접근</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="항목">
          <Select value={procedure} onValueChange={setProcedure}>
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
          <Input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className="w-40" />
        </FilterField>
        <FilterField label="종료일">
          <Input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className="w-40" />
        </FilterField>
        {isFiltered && (
          <Button type="button" variant="ghost" onClick={reset}>초기화</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <AuditHeaderRow showChannel />
          </TableHeader>
          <TableBody>
            <AuditPages key={filterKey} filters={filters} />
          </TableBody>
        </Table>
      </div>
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

/** 커서 목록 — 필터가 바뀌면 부모가 key 로 이 컴포넌트를 새로 만들어 첫 페이지부터 */
function AuditPages({ filters }: { filters: Filters }) {
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  return (
    <>
      {cursors.map((cursor, index) => (
        <AuditPage
          key={cursor ?? 'first'}
          cursor={cursor}
          filters={filters}
          isLast={index === cursors.length - 1}
          onMore={(next) => setCursors((prev) => (prev.includes(next) ? prev : [...prev, next]))}
        />
      ))}
    </>
  );
}

function AuditPage({ cursor, filters, isLast, onMore }: { cursor: number | null; filters: Filters; isLast: boolean; onMore: (next: number) => void }) {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery(trpc.audit.adminLogs.queryOptions({ ...filters, limit: PAGE_SIZE, cursor }));

  if (isPending) return <AuditSkeletonRow colSpan={COLUMNS} />;
  if (error) return <AuditMessageRow colSpan={COLUMNS}>기록을 불러오지 못했습니다: {error.message}</AuditMessageRow>;

  return (
    <>
      {cursor === null && data.logs.length === 0 && (
        <AuditMessageRow colSpan={COLUMNS} tall>조건에 맞는 기록이 없습니다.</AuditMessageRow>
      )}
      {data.logs.map((log) => (
        <AuditRow key={log.id} log={log} showChannel />
      ))}
      {isLast && data.nextCursor != null && <AuditMoreRow colSpan={COLUMNS} onMore={() => onMore(data.nextCursor!)} />}
    </>
  );
}
