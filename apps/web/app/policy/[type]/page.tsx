import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isPolicySlug, POLICY_LABEL, PolicyView } from '@/components/policy/policy-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  return isPolicySlug(type) ? { title: `${POLICY_LABEL[type]} · 위즈봇` } : {};
}

/** 약관 현재 버전 (#252) — /policy/terms · /policy/privacy */
export default async function Page({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  if (!isPolicySlug(type)) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16">
      <PolicyView slug={type} />
    </main>
  );
}
