import { NextResponse } from 'next/server';

import { signJwt } from '@/lib/jwt';
import { trpc } from '@/src/utils/trpc';
import { getPublicSiteUrl } from '../_apis/chzzk';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const email = searchParams.get('email');
  const code = searchParams.get('code');

  if (!email || !code) {
    return NextResponse.json({ message: 'Missing email or code' }, { status: 400 });
  }

  const publicSiteUrl = await getPublicSiteUrl();
  try {
    const check = await trpc.admin.loginCheck.query({
      email,
      code,
    });

    const token = await signJwt({ id: check.id, role: 'admin' });

    return NextResponse.redirect(`${publicSiteUrl}/login/redirect?to=/admin`, {
      headers: {
        'Set-Cookie': `session-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict${
          isProduction ? '; Secure' : ''
        }`,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during authentication:', error);
    return NextResponse.redirect(`${publicSiteUrl}/unauthorized`);
  }
}
