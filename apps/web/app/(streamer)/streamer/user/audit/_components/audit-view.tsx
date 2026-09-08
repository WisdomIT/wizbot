'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  auditColumnCount,
  AuditHeaderRow,
  AuditMessageRow,
  AuditMoreRow,
  AuditRow,
  AuditSkeletonRow,
} from '@/components/audit-log-rows';
import { Table, TableBody, TableHeader } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

const PAGE_SIZE = 50;
const COLUMNS = auditColumnCount(false);

/**
 * 설정 변경 기록 (#175). 본인 변경·어드민 대행(#71)·챗봇 명령이 전부 같은 목록에 남는다 —
 * 관리자가 무엇을 바꿨는지 스트리머에게 그대로 보이는 투명성 장치다. 어드민 대행 콘솔에도 같은 화면이 뜬다.
 * 로그인과 관리자 대행 시작/종료 같은 접근 기록(#254)도 같은 목록에 「접근」 표시로 남는다.
 *
 * 페이지네이션은 커서 목록 state + 페이지별 컴포넌트로 — tRPC 의 infiniteQueryOptions 는
 * 라우터 전체 타입을 재귀하다 "Type instantiation is excessively deep" 로 터진다 (실측).
 */
export function AuditView() {
  const [cursors, setCursors] = useState<(number | null)[]>([null]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-muted-foreground">
        설정을 바꾼 기록입니다. 본인뿐 아니라 관리자가 대신 바꾼 것, 채팅 명령(!추가 등)으로 바뀐 것도 남습니다.
        로그인과 관리자가 이 콘솔을 대신 연 기록도 함께 남습니다.
        재생 조작과 대기열에 곡을 넣고 뺀 것은 기록하지 않습니다 (재생 기록에 남습니다).
      </p>
      <Table>
        <TableHeader>
          <AuditHeaderRow />
        </TableHeader>
        <TableBody>
          {cursors.map((cursor, index) => (
            <AuditPage
              key={cursor ?? 'first'}
              cursor={cursor}
              isLast={index === cursors.length - 1}
              onMore={(next) => setCursors((prev) => (prev.includes(next) ? prev : [...prev, next]))}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** 한 페이지(50건) — 각 페이지가 자기 쿼리를 들고 있어 누적 state 가 필요 없다 */
function AuditPage({ cursor, isLast, onMore }: { cursor: number | null; isLast: boolean; onMore: (next: number) => void }) {
  const trpc = useTRPC();
  const { data, isPending, error } = useQuery(trpc.audit.logs.queryOptions({ limit: PAGE_SIZE, cursor }));

  if (isPending) return <AuditSkeletonRow colSpan={COLUMNS} />;
  if (error) return <AuditMessageRow colSpan={COLUMNS}>기록을 불러오지 못했습니다: {error.message}</AuditMessageRow>;

  return (
    <>
      {cursor === null && data.logs.length === 0 && (
        <AuditMessageRow colSpan={COLUMNS} tall>아직 기록이 없습니다.</AuditMessageRow>
      )}
      {data.logs.map((log) => (
        <AuditRow key={log.id} log={log} />
      ))}
      {isLast && data.nextCursor != null && <AuditMoreRow colSpan={COLUMNS} onMore={() => onMore(data.nextCursor!)} />}
    </>
  );
}
