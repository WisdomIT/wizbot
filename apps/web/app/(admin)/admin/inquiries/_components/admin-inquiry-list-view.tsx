'use client';

import { useQuery } from '@tanstack/react-query';
import { INQUIRY_STATUS_LABEL } from '@wizbot/shared/services/inquiry';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

/** 문의 목록 — 어드민 (#206 3/3) */
export function AdminInquiryListView() {
  const trpc = useTRPC();
  const { data, isPending } = useQuery(trpc.inquiry.adminList.queryOptions());

  if (isPending) return <Skeleton className="my-4 h-96 w-full" />;

  return (
    <div className="flex flex-col gap-4 py-4">
      <p className="text-sm text-muted-foreground">스트리머 문의입니다. 새 문의는 메일로도 전달됩니다.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>제목</TableHead>
            <TableHead className="w-40">스트리머</TableHead>
            <TableHead className="w-28">상태</TableHead>
            <TableHead className="w-40 text-right">마지막 활동</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).length === 0 ? (
            <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">문의가 없습니다.</TableCell></TableRow>
          ) : (
            data!.map((inquiry) => (
              <TableRow key={inquiry.id}>
                <TableCell>
                  <Link href={`/admin/inquiries/${inquiry.id}`} className="flex items-center gap-2 font-medium hover:underline">
                    {inquiry.title}
                    {inquiry.unread && <span aria-label="새 문의" className="size-2 shrink-0 rounded-full bg-red-500" />}
                  </Link>
                </TableCell>
                <TableCell>{inquiry.channelName}</TableCell>
                <TableCell>
                  <Badge variant={inquiry.status === 'ANSWERED' ? 'default' : 'secondary'}>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{new Date(inquiry.updatedAt).toLocaleString('ko-KR')}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
