import { NextResponse } from 'next/server';

import { signJwt } from '@/lib/jwt';

import { getChzzkTokenInterlock, getPublicSiteUrl } from '../_apis/chzzk';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ message: 'Missing code or state' }, { status: 400 });
  }

  try {
    const auth = await getChzzkTokenInterlock({ code, state });

    const { userId } = auth;

    const token = await signJwt({ id: userId, role: 'streamer' });
    const publicSiteUrl = getPublicSiteUrl();

    return NextResponse.redirect(`${publicSiteUrl}/login/redirect?to=/streamer`, {
      headers: {
        'Set-Cookie': `session-token=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Strict${
          isProduction ? '; Secure' : ''
        }`,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during authentication:', error);
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }
}
