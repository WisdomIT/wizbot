'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 유튜브 채널 설정 (#9). 채널 주소나 @핸들을 넣으면 채널 ID 를 찾아 저장한다 — UC… 를 스트리머가 알 필요 없다.
 * 대문에서는 업로드 재생목록 embed 가 들어가 새 영상이 자동으로 보인다. 자리·크기는 연동 설정에서 고른다.
 */
export function YoutubeView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.cafe.get.queryOptions());
  const setYoutube = useMutation(trpc.cafe.setYoutube.mutationOptions());
  const [input, setInput] = useState('');
  useEffect(() => {
    if (data) setInput(data.youtubeUrl ?? '');
  }, [data]);

  if (isPending) return <Skeleton className="h-60 w-full" />;

  const run = (value: string | null, messages: { loading: string; success: (applying: boolean) => string }) =>
    toast.promise(setYoutube.mutateAsync({ input: value }), {
      loading: messages.loading,
      success: (r) => {
        void queryClient.invalidateQueries(trpc.cafe.get.queryFilter());
        void queryClient.invalidateQueries(trpc.cafe.gate.queryFilter());
        return messages.success(r.applying);
      },
      error: (err) => (err instanceof Error ? err.message : String(err)),
    });

  const connected = data?.youtubeChannelId ?? null;

  return (
    <div className="flex max-w-2xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>유튜브 채널</CardTitle>
          <CardDescription>
            채널 주소(youtube.com/@핸들)나 @핸들을 넣으면 채널을 찾아 연결합니다. 대문에는 이 채널의 업로드 영상 재생목록이 들어가고, 새 영상은 자동으로 보입니다.
            대문의 어느 자리에 넣을지는 <Link href="/streamer/cafe/setting" className="underline">연동 설정</Link>에서 고르며, 크기는 그 자리를 따릅니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://www.youtube.com/@채널핸들" />
            <Button
              disabled={setYoutube.isPending || !input.trim()}
              onClick={() => run(input, { loading: '채널을 찾는 중...', success: (applying) => (applying ? '채널을 연결했습니다. 대문에 반영하는 중입니다.' : '채널을 연결했습니다.') })}
            >
              연결
            </Button>
          </div>
          {connected ? (
            <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <div className="font-medium">{data?.youtubeTitle ?? '(이름 없음)'}</div>
                <div className="font-mono text-xs text-muted-foreground">{connected}</div>
              </div>
              <Button variant="ghost" size="sm" disabled={setYoutube.isPending} onClick={() => run(null, { loading: '해제 중...', success: (applying) => (applying ? '연결을 해제했습니다. 대문에서 빼는 중입니다.' : '연결을 해제했습니다.') })}>
                연결 해제
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">연결된 채널이 없습니다.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
