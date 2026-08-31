import { notFound } from 'next/navigation';

import { AdminInquiryThreadView } from '../_components/admin-inquiry-thread-view';

/** 문의 스레드 — 어드민 (#206 3/3) */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return <AdminInquiryThreadView id={Number(id)} />;
}
