import { NextResponse } from 'next/server';

import { getPublicSiteUrl } from '../_apis/chzzk';

const isProduction = process.env.NODE_ENV === 'production';

export async function GET() {
  const publicSiteUrl = await getPublicSiteUrl();

  return NextResponse.redirect(`${publicSiteUrl}`, {
    headers: {
      'Set-Cookie': `session-token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${
        isProduction ? '; Secure' : ''
      }`,
    },
  });
}
