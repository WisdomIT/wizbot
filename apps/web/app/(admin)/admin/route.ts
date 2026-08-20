import { redirectTo } from '@/lib/request-url';

export function GET() {
  return redirectTo('/admin/whitelist');
}
