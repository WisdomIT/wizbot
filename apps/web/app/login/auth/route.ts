import { NextResponse } from 'next/server';

import { getChzzkTokenInterlock } from '../_apis/chzzk';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code || !state) {
    return NextResponse.json({ message: 'Missing code or state' }, { status: 400 });
  }

  try {
    const auth = await getChzzkTokenInterlock({ code, state });
    return NextResponse.json(auth);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during authentication:', error);
    return NextResponse.json({ message: (error as Error).message }, { status: 500 });
  }
}
