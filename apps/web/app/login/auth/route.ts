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

  const publicSiteUrl = await getPublicSiteUrl();
  try {
    const auth = await getChzzkTokenInterlock({ code, state });

    const { userId } = auth;

    const token = await signJwt({ id: userId, role: 'streamer' });

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
    if (error instanceof Error) {
      return NextResponse.redirect(`${publicSiteUrl}/login?error=${error.message}`);
    }
    return NextResponse.redirect(`${publicSiteUrl}/login?error=Unknown error occurred`);
  }
}
