import { redirectTo } from '@/lib/request-url';

export async function GET(request: Request, { params }: { params: Promise<{ nickname: string }> }) {
  const { nickname } = await params;
  return redirectTo(`/${encodeURIComponent(nickname)}/command`);
}
