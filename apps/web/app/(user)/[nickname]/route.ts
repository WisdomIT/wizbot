import { NextResponse } from 'next/server';

import { getPublicSiteUrl } from '@/app/login/_apis/chzzk';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathnameParts = url.pathname.split('/'); // ['', '닉네임']
  const nickname = decodeURIComponent(pathnameParts[1] || '');

  const publicSiteUrl = await getPublicSiteUrl();
  return NextResponse.redirect(`${publicSiteUrl}/${nickname}/command`);
}
