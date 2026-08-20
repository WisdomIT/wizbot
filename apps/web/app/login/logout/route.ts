import { redirectTo } from '@/lib/request-url';

const isProduction = process.env.NODE_ENV === 'production';

export function GET() {
  return redirectTo('/', {
    'Set-Cookie': `session-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${
      isProduction ? '; Secure' : ''
    }`,
  });
}
