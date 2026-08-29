import { CAFE_SCENES, type CafeScene } from '@wizbot/shared/lib/cafeLayout';
import type { NextRequest } from 'next/server';

import { renderCafeImage } from '@/lib/cafe-render';
import { trpc } from '@/src/utils/trpc';

/**
 * 카페 대문 상태 이미지 (#9 PR2). 네이버가 `<img src>` 로 가져간다.
 *
 * - `?v=N` : 워커가 저장한 N번째 상태. 같은 v 는 항상 같은 그림 → 영구 캐시.
 *            네이버가 캐시하는 것이 오히려 이득이 되고, 공유 볼륨·오브젝트 스토리지가 필요 없다.
 * - `?preview=1&scene=live|offline` : 에디터 미리보기 — 샘플 데이터, 캐시 없음.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId: raw } = await params;
  const channelId = raw.replace(/\.png$/, '');
  const { searchParams } = request.nextUrl;
  const preview = searchParams.get('preview') === '1';
  const sceneParam = searchParams.get('scene');
  const scene = (CAFE_SCENES as readonly string[]).includes(sceneParam ?? '') ? (sceneParam as CafeScene) : undefined;

  const data = await trpc.cafe.renderData.query({ channelId, scene, preview }).catch(() => null);
  if (!data) return new Response('Not Found', { status: 404 });

  const png = await renderCafeImage({ layout: data.layout, snapshot: data.snapshot, background: data.background });
  const requestedSerial = searchParams.get('v');
  //  요청한 v 가 현재 일련번호와 같을 때만 영구 캐시 — 아니면(옛 v·미지정) 짧게
  const immutable = !preview && requestedSerial !== null && Number(requestedSerial) === data.serial;
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-store',
    },
  });
}
