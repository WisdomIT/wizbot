import { CAFE_SCENES, type CafeScene } from '@wizbot/shared/lib/cafeLayout';
import type { NextRequest } from 'next/server';

import { trpc } from '@/src/utils/trpc';

/** 에디터 캔버스가 배경으로 쓰는 원본 이미지 (#9 PR2). 어차피 카페 대문에 공개되는 그림이다 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const sceneParam = request.nextUrl.searchParams.get('scene');
  const scene = (CAFE_SCENES as readonly string[]).includes(sceneParam ?? '') ? (sceneParam as CafeScene) : 'live';
  const data = await trpc.cafe.renderData.query({ channelId, scene, preview: true }).catch(() => null);
  if (!data?.background) return new Response('Not Found', { status: 404 });
  return new Response(new Uint8Array(Buffer.from(data.background.base64, 'base64')), {
    headers: { 'Content-Type': data.background.mimeType, 'Cache-Control': 'no-store' },
  });
}
