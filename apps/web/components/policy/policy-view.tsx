import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import Markdown from '@/components/custom/markdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/src/utils/trpc';

export const POLICY_LABEL = { terms: '서비스 이용약관', privacy: '개인정보처리방침' } as const;

export type PolicySlug = keyof typeof POLICY_LABEL;

export function isPolicySlug(value: string): value is PolicySlug {
  return value === 'terms' || value === 'privacy';
}

function apiType(slug: PolicySlug) {
  return slug === 'terms' ? ('TERMS' as const) : ('PRIVACY' as const);
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * 약관 본문 (#252). id 가 없으면 현재(최신) 버전, 있으면 그 버전을 보여준다.
 * 하단에 개정 이력(등록 날짜 + 버전) — 클릭하면 그 버전으로 이동한다.
 */
export async function PolicyView({ slug, id }: { slug: PolicySlug; id?: string }) {
  const type = apiType(slug);
  const [doc, history] = await Promise.all([
    id === undefined
      ? trpc.policy.current.query({ type })
      : /^\d+$/.test(id)
        ? trpc.policy.get.query({ id: Number(id) }).catch(() => null)
        : null,
    trpc.policy.history.query({ type }),
  ]);

  if (id !== undefined && !doc) notFound();

  const current = history[0];
  const isViewingOld = doc !== null && current !== undefined && doc.id !== current.id;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">{POLICY_LABEL[slug]}</CardTitle>
          {doc && (
            <CardDescription>
              버전 {doc.version} · {formatDate(doc.publishedAt)} 시행
              {isViewingOld && ' · 이전 버전'}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {isViewingOld && (
            <Link
              href={`/policy/${slug}`}
              className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> 현재 버전 보기
            </Link>
          )}
          <Separator className="mb-6" />
          {doc ? (
            <article>
              <Markdown>{doc.body}</Markdown>
            </article>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">등록된 약관이 없습니다.</p>
          )}

          {history.length > 0 && (
            <>
              <Separator className="my-8" />
              <section>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground">개정 이력</h2>
                <ul className="flex flex-col gap-1">
                  {history.map((entry) => {
                    const active = doc?.id === entry.id;
                    return (
                      <li key={entry.id}>
                        <Link
                          href={`/policy/${slug}/${entry.id}`}
                          className={`flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted ${active ? 'font-medium' : 'text-muted-foreground'}`}
                        >
                          <span className="tabular-nums">{formatDate(entry.publishedAt)}</span>
                          <span>버전 {entry.version}</span>
                          {entry.id === current?.id && (
                            <span className="text-xs text-muted-foreground">(현재)</span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
