import { PlaylistView } from './_components/playlist-view';

export default async function Page({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  return <PlaylistView channelId={channelId} />;
}
