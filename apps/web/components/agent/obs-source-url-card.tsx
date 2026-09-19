'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RadioTower } from 'lucide-react';
import { toast } from 'sonner';

import { ObsSourceUrlField } from '@/components/song/obs-source-url-field';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 에이전트 패널의 OBS 주소 카드 (#326). 도구 `get_obs_source_url` 은 주소를 모델에 주지 않고 「카드를 표시했다」고만 답한다 —
 * 주소(토큰)는 이 컴포넌트가 tRPC 로 직접 읽는다. 그래서 대화 기록·LLM 컨텍스트에 토큰이 남지 않고, 기록을 다시 열어도 현재 주소가 보인다
 */
export function ObsSourceUrlCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useQuery(trpc.song.getState.queryOptions());
  const regenerate = useMutation(trpc.song.regenerateToken.mutationOptions());

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <RadioTower className="size-4" /> OBS 브라우저 소스 주소
      </div>
      <ObsSourceUrlField
        token={data?.source.sourceToken ?? null}
        onRegenerate={() =>
          toast.promise(regenerate.mutateAsync({ kind: 'source' }), {
            loading: '재발급 중...',
            success: () => {
              void queryClient.invalidateQueries(trpc.song.pathFilter());
              return '주소를 새로 발급했습니다. OBS 에 다시 붙여넣으세요.';
            },
            error: (err) => (err instanceof Error ? err.message : String(err)),
          })
        }
      />
      <p className="text-xs text-muted-foreground">이 주소를 OBS 브라우저 소스로 추가하세요. 주소를 아는 사람은 재생 상태를 볼 수 있으니 방송에 노출됐다면 재발급하세요.</p>
    </div>
  );
}
