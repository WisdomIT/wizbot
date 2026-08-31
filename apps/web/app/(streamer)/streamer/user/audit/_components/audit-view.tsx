'use client';

import { useQuery } from '@tanstack/react-query';
import { auditLabel } from '@wizbot/shared/lib/audit';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

const PAGE_SIZE = 50;

/**
 * 설정 변경 기록 (#175). 본인 변경·어드민 대행(#71)·챗봇 명령이 전부 같은 목록에 남는다 —
 * 관리자가 무엇을 바꿨는지 스트리머에게 그대로 보이는 투명성 장치다. 어드민 대행 콘솔에도 같은 화면이 뜬다.
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
        재생 조작과 대기열에 곡을 넣고 뺀 것은 기록하지 않습니다 (재생 기록에 남습니다).
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">시각</TableHead>
            <TableHead className="w-36">행위자</TableHead>
            <TableHead className="w-56">변경</TableHead>
            <TableHead>내용</TableHead>
          </TableRow>
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
  const { data, isPending, error } = useQuery({
    ...trpc.audit.logs.queryOptions({ limit: PAGE_SIZE, cursor }),
    //  콘솔 공통 staleTime(30초) 캐시를 쓰면 방금 바꾼 설정이 안 보인다 — 기록은 들어올 때마다 새로 읽는다
    staleTime: 0,
    refetchOnMount: 'always',
  });

  if (isPending) {
    return (
      <TableRow>
        <TableCell colSpan={4}><Skeleton className="h-16 w-full" /></TableCell>
      </TableRow>
    );
  }
  if (error) {
    return (
      <TableRow>
        <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">기록을 불러오지 못했습니다: {error.message}</TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {cursor === null && data.logs.length === 0 && (
        <TableRow>
          <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">아직 기록이 없습니다.</TableCell>
        </TableRow>
      )}
      {data.logs.map((log) => (
        <Row key={log.id} log={log} />
      ))}
      {isLast && data.nextCursor != null && (
        <TableRow>
          <TableCell colSpan={4} className="text-center">
            <Button variant="outline" size="sm" onClick={() => onMore(data.nextCursor!)}>더 보기</Button>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function Row({ log }: { log: { id: number; createdAt: string | Date; procedure: string; inputText: string | null; actorType: string; actorLabel: string } }) {
  const summary = log.inputText ?? '';
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(log.createdAt).toLocaleString('ko-KR')}</TableCell>
      <TableCell>
        <Badge variant={log.actorType === 'ADMIN' ? 'destructive' : log.actorType === 'CHATBOT' ? 'secondary' : 'outline'}>
          {log.actorLabel}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span>{auditLabel(log.procedure)}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{log.procedure}</span>
        </div>
      </TableCell>
      <TableCell>
        {summary && (
          <code className="block max-w-xl truncate font-mono text-xs text-muted-foreground" title={summary}>
            {summary}
          </code>
        )}
      </TableCell>
    </TableRow>
  );
}
