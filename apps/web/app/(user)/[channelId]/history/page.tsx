import { HistoryView } from './_components/history-view';

export default async function Page({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  return <HistoryView channelId={channelId} />;
}
