import { redirectTo } from '@/lib/request-url';

export function GET() {
  return redirectTo('/streamer/bot/command');
}
