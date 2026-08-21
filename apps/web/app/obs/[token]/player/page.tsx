import { ObsPlayer } from './_components/obs-player';

/**
 * OBS 브라우저 소스용 재생 페이지 (#5 2단계).
 * 영상은 보이지 않고 소리만 나간다. 브라우저 소스는 autoplay 가 허용되므로
 * 창이 백그라운드여도 다음 곡이 이어서 재생된다.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ObsPlayer token={token} />;
}
