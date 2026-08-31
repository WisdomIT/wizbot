'use client';

import { useQuery } from '@tanstack/react-query';
import { INQUIRY_STATUS_LABEL } from '@wizbot/shared/services/inquiry';
import { Plus } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTRPC } from '@/src/utils/trpc-react';

/** 내 문의 목록 (#206 3/3) */
export function InquiryListView() {
  const trpc = useTRPC();
  const { data, isPending } = useQuery(trpc.inquiry.list.queryOptions());

  if (isPending) return <Skeleton className="my-4 h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>문의사항</CardTitle>
            <CardDescription>운영자에게 문의를 남기면 메일로 전달되고, 답변이 달리면 여기에 표시됩니다.</CardDescription>
          </div>
          <Button size="sm" asChild>
            <Link href="/streamer/inquiry/new"><Plus className="size-4" /> 문의 작성</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead className="w-28">상태</TableHead>
              <TableHead className="w-40 text-right">마지막 활동</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={3} className="py-10 text-center text-muted-foreground">문의 내역이 없습니다.</TableCell></TableRow>
            ) : (
              data!.map((inquiry) => (
                <TableRow key={inquiry.id}>
                  <TableCell>
                    <Link href={`/streamer/inquiry/${inquiry.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      {inquiry.title}
                      {inquiry.unread && <span aria-label="새 답변" className="size-2 shrink-0 rounded-full bg-red-500" />}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={inquiry.status === 'ANSWERED' ? 'default' : 'secondary'}>{INQUIRY_STATUS_LABEL[inquiry.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{new Date(inquiry.updatedAt).toLocaleDateString('ko-KR')}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
