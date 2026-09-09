import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import Markdown from '@/components/custom/markdown';
import { getManualPage } from '@/lib/manual';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = getManualPage(slug);
  return { title: page ? `${page.title} · 위즈봇 이용 안내` : '이용 안내 · 위즈봇' };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getManualPage(slug);
  if (!page) return notFound();

  return (
    <main className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>{page.title}</h1>
      <Markdown>{page.body}</Markdown>
    </main>
  );
}
