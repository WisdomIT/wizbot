import { ObsOverlay } from './_components/obs-overlay';

/**
 * OBS 자막 오버레이 (#5 2-b) — 현재 재생 중인 곡을 화면에 표시한다.
 * 읽기 전용 토큰(songOverlayToken)으로 동작하며 재생에는 관여하지 않는다.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ color?: string; size?: string }>;
}) {
  const [{ token }, { color, size }] = await Promise.all([params, searchParams]);
  return <ObsOverlay token={token} color={color} size={size} />;
}
