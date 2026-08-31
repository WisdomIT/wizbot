import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import Markdown from '@/components/custom/markdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/src/utils/trpc';

/** 공지 본문 (#206) — 마크다운(GFM) 렌더. 다른 페이지들과 같은 카드 구성 */
export async function NoticeArticle({ id, backHref }: { id: string; backHref: string }) {
  if (!/^\d+$/.test(id)) notFound();
  const notice = await trpc.notice.get.query({ id: Number(id) }).catch(() => null);
  if (!notice) notFound();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href={backHref}><ArrowLeft className="size-4" /> 공지사항</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{notice.title}</CardTitle>
          <CardDescription>{new Date(notice.createdAt).toLocaleString('ko-KR')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Separator className="mb-6" />
          <article>
            <Markdown>{notice.body}</Markdown>
          </article>
        </CardContent>
      </Card>
    </div>
  );
}
