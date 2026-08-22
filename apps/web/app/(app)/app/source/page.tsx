import { SourcePlayer } from '@/components/song/source-player';
import { trpc } from '@/src/utils/trpc';

/**
 * 앱의 숨은 재생 창이 로드하는 페이지 (#85).
 * OBS 브라우저 소스와 같은 일을 하되 송출 소스를 ELECTRON 으로 등록한다.
 * 토큰은 URL 에 노출되지 않도록 세션으로 조회해 내려준다.
 */
export default async function Page() {
  const state = await trpc.song.getState.query().catch(() => null);
  const token = state?.source.sourceToken;

  if (!token) {
    return <p className="p-4 text-sm text-muted-foreground">송출 소스 토큰이 없습니다.</p>;
  }

  return <SourcePlayer token={token} source="ELECTRON" />;
}
