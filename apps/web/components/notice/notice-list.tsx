import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { trpc } from '@/src/utils/trpc';

/** 공지 목록 (#206) — 콘솔·시청자·공개 페이지가 공유. 다른 페이지들과 같은 카드 + 테이블 구성 */
export async function NoticeList({ base, limit = 50 }: { base: string; limit?: number }) {
  const notices = await trpc.notice.list.query({ limit }).catch(() => []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>공지사항</CardTitle>
        <CardDescription>위즈봇의 새 소식과 변경 사항을 알려드립니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead className="w-32 text-right">작성일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="py-10 text-center text-muted-foreground">등록된 공지사항이 없습니다.</TableCell>
              </TableRow>
            ) : (
              notices.map((notice) => (
                <TableRow key={notice.id}>
                  <TableCell>
                    <Link href={`${base}/${notice.id}`} className="block font-medium hover:underline">
                      {notice.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {new Date(notice.createdAt).toLocaleDateString('ko-KR')}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
