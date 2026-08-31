import { notFound } from 'next/navigation';

import { InquiryThreadView } from '../_components/inquiry-thread-view';

/** 문의 스레드 (#206 3/3) */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  return (
    <div className="max-w-5xl py-4">
      <InquiryThreadView id={Number(id)} />
    </div>
  );
}
