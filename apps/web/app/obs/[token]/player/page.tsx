import { SourcePlayer } from '@/components/song/source-player';
import { FontLink } from '@/components/theme/font-link';
import { FONT_FAMILY } from '@/lib/fonts';
import { trpc } from '@/src/utils/trpc';

/**
 * OBS 브라우저 소스용 재생 페이지 (#5 2단계).
 * 영상은 보이지 않고 소리만 나간다. 브라우저 소스는 autoplay 가 허용되므로
 * 창이 백그라운드여도 다음 곡이 이어서 재생된다.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // 자막이 스트리머 폰트를 따라간다 (#77). 색은 방송 화면 위에서 읽혀야 하므로 흰색 그대로
  const theme = await trpc.user.getThemeBySourceToken.query({ token }).catch(() => null);
  const fontKey = theme?.fontKey ?? 'suit';
  return (
    <>
      <FontLink keys={[fontKey]} />
      <SourcePlayer token={token} fontFamily={FONT_FAMILY[fontKey] ?? undefined} />
    </>
  );
}
