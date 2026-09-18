import { SourcePlayer } from '@/components/song/source-player';
import { trpc } from '@/src/utils/trpc';

/**
 * 앱의 숨은 재생 창이 로드하는 페이지 (#85).
 * OBS 브라우저 소스와 같은 일을 하되 송출 소스를 ELECTRON 으로 등록한다.
 * 토큰은 URL 에 노출되지 않도록 세션으로 조회해 내려준다.
 * 세션 ID·컴퓨터 이름은 앱(메인 프로세스)이 쿼리로 준다 (#322) — 컴퓨터를 껐다 켜도 같은 ID 라야 「이 앱」 선택이 유지된다
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; label?: string }> }) {
  const [state, params] = await Promise.all([trpc.song.getState.query().catch(() => null), searchParams]);
  const token = state?.source.sourceToken;

  if (!token) {
    return <p className="p-4 text-sm text-muted-foreground">송출 소스 토큰이 없습니다.</p>;
  }

  return <SourcePlayer token={token} source="ELECTRON" sessionId={params.session} label={params.label} />;
}
