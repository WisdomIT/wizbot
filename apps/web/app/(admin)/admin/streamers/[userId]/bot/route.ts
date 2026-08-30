import { redirectTo } from '@/lib/request-url';

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return redirectTo(`/admin/streamers/${userId}/bot/command`);
}
