import { NextResponse } from 'next/server';

import { getPublicSiteUrl } from '@/app/login/_apis/chzzk';

export async function GET(request: Request, context: { params: { nickname: string } }) {
  const { nickname } = context.params;
  const publicSiteUrl = await getPublicSiteUrl();
  return NextResponse.redirect(`${publicSiteUrl}/${nickname}/command`);
}
