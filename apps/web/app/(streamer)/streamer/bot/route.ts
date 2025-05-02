import { NextResponse } from 'next/server';

import { getPublicSiteUrl } from '@/app/login/_apis/chzzk';

export async function GET(request: Request) {
  const publicSiteUrl = await getPublicSiteUrl();
  return NextResponse.redirect(`${publicSiteUrl}/streamer/bot/command`);
}
