import { redirectTo } from '@/lib/request-url';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { channelId } = await params;
  return redirectTo(`/${encodeURIComponent(channelId)}/command`);
}
