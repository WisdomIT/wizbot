'use client';

import { auditLabel, isAccessProcedure } from '@wizbot/shared/lib/audit';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableHead, TableRow } from '@/components/ui/table';

/**
 * 감사 기록 표의 행 (#175, #254). 스트리머 「변경 기록」과 어드민 「감사 기록」이 같은 행을 쓴다 —
 * 어드민 쪽은 대상 채널 열이 하나 더 있고(showChannel), 행위자에 관리자 이메일이 붙는다.
 * 페이지 컴포넌트(쿼리)는 각 화면이 들고 있다 — tRPC 쿼리 옵션을 prop 으로 넘기면 라우터 타입 재귀가 터진다.
 */
export interface AuditRowData {
  id: number;
  createdAt: string | Date;
  procedure: string;
  inputText: string | null;
  actorType: string;
  actorLabel: string;
  /** 대상 채널. userId 가 null 이면 탈퇴한 계정 (접근 기록은 탈퇴 후에도 남는다, #254) */
  channel?: { userId: number | null; channelId: string; channelName: string } | null;
}

export function AuditHeaderRow({ showChannel = false }: { showChannel?: boolean }) {
  return (
    <TableRow>
      <TableHead className="w-44">시각</TableHead>
      {showChannel && <TableHead className="w-44">채널</TableHead>}
      <TableHead className="w-36">행위자</TableHead>
      <TableHead className="w-56">변경</TableHead>
      <TableHead>내용</TableHead>
    </TableRow>
  );
}

export function auditColumnCount(showChannel: boolean): number {
  return showChannel ? 5 : 4;
}

/** 로딩·오류·빈 목록 등 표 전체 폭의 안내 행 */
export function AuditMessageRow({ colSpan, children, tall = false }: { colSpan: number; children: React.ReactNode; tall?: boolean }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className={`text-center text-muted-foreground ${tall ? 'py-10' : 'py-6'}`}>{children}</TableCell>
    </TableRow>
  );
}

export function AuditSkeletonRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}><Skeleton className="h-16 w-full" /></TableCell>
    </TableRow>
  );
}

export function AuditMoreRow({ colSpan, onMore }: { colSpan: number; onMore: () => void }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center">
        <Button variant="outline" size="sm" onClick={onMore}>더 보기</Button>
      </TableCell>
    </TableRow>
  );
}

function actorVariant(actorType: string): 'destructive' | 'secondary' | 'outline' {
  return actorType === 'ADMIN' ? 'destructive' : actorType === 'CHATBOT' ? 'secondary' : 'outline';
}

export function AuditRow({ log, showChannel = false }: { log: AuditRowData; showChannel?: boolean }) {
  const [open, setOpen] = useState(false);
  const summary = log.inputText ?? '';
  const access = isAccessProcedure(log.procedure);

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(log.createdAt).toLocaleString('ko-KR')}</TableCell>
      {showChannel && (
        <TableCell>
          {log.channel ? (
            <div className="flex flex-col">
              <span className="flex items-center gap-1.5">
                {/* 탈퇴하지 않은 채널은 이름을 누르면 그 스트리머의 대행 콘솔을 연다 (#71) — 스트리머 목록과 같은 진입점 */}
                {log.channel.userId === null ? (
                  log.channel.channelName
                ) : (
                  <a href={`/admin/streamers/${log.channel.userId}/enter`} className="font-medium hover:underline">{log.channel.channelName}</a>
                )}
                {log.channel.userId === null && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">탈퇴</Badge>}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">{log.channel.channelId}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      <TableCell>
        <Badge variant={actorVariant(log.actorType)} className="max-w-full truncate" title={log.actorLabel}>
          {log.actorLabel}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="flex items-center gap-1.5">
            {auditLabel(log.procedure)}
            {access && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">접근</Badge>}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{log.procedure}</span>
        </div>
      </TableCell>
      <TableCell>
        {summary && (
          <>
            {/* 잘린 요약을 누르면 전체 입력을 본다 (#254) — 값 자체는 기록 시점에 이미 마스킹·절단돼 있다 */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="block max-w-xl cursor-pointer truncate text-left font-mono text-xs text-muted-foreground hover:underline"
              title="자세히 보기"
            >
              {summary}
            </button>
            <AuditDetailDialog log={log} open={open} onOpenChange={setOpen} />
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function AuditDetailDialog({ log, open, onOpenChange }: { log: AuditRowData; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{auditLabel(log.procedure)}</DialogTitle>
          <DialogDescription className="flex flex-col gap-0.5">
            <span>{new Date(log.createdAt).toLocaleString('ko-KR')} · {log.actorLabel}</span>
            {log.channel && <span>{log.channel.channelName} ({log.channel.channelId})</span>}
            <span className="font-mono text-[11px]">{log.procedure}</span>
          </DialogDescription>
        </DialogHeader>
        <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all">
          {prettyJson(log.inputText ?? '')}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
