'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 사용 신청 설정 (#297) — 「신청 처리」(사유 입력칸·자동 승인)와 「새 스트리머 초기값」(공개 기준 팔로워·기본 플레이리스트).
 * 전부 새 스트리머가 들어올 때의 규칙이라 한 화면에 둔다. 목록 화면에서는 뺐다.
 */
export function SignupSettingsView() {
  return (
    <div className="flex max-w-3xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">신청 처리</CardTitle>
          <CardDescription>사용 신청 화면과 승인 방식.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignupSettings section="signup" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">새 스트리머 초기값</CardTitle>
          <CardDescription>승인·첫 로그인으로 계정이 만들어질 때 적용됩니다. 기존 계정에는 소급하지 않습니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <SignupSettings section="defaults" />
          <DefaultPlaylistSetting />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 새 스트리머에게 만들어주는 대표 즐겨찾기의 출처 재생목록 (#246).
 * 승인·첫 로그인 프로비저닝에서 쓰인다.
 */
function DefaultPlaylistSetting() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data } = useQuery(trpc.admin.getDefaultPlaylist.queryOptions());
  const save = useMutation(trpc.admin.setDefaultPlaylist.mutationOptions());
  //  null 이면 서버 값을 따른다 — 편집 시작 후에만 draft 를 쓴다 (#200 패턴)
  const [draft, setDraft] = useState<string | null>(null);
  const url = draft ?? data?.url ?? '';

  function handleSave() {
    toast.promise(save.mutateAsync({ url }), {
      loading: '저장 중...',
      success: () => {
        setDraft(null);
        void queryClient.invalidateQueries(trpc.admin.getDefaultPlaylist.queryFilter());
        return url ? '기본 플레이리스트를 저장했습니다.' : '기본 플레이리스트를 비웠습니다.';
      },
      error: (error) => `저장에 실패했습니다. ${error instanceof Error ? error.message : error}`,
    });
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-6">
      <Label htmlFor="default-playlist">기본 플레이리스트</Label>
      <p className="text-xs text-muted-foreground">
        승인된 새 채널에 만들어주는 「위즈 추천 플레이리스트」 대표 즐겨찾기의 유튜브 재생목록
        주소입니다. 비우면 인기 곡 1곡으로 대체합니다.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <Input
          id="default-playlist"
          value={url}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="https://www.youtube.com/playlist?list=..."
          className="max-w-xl"
        />
        <Button type="submit" disabled={save.isPending || draft === null}>
          저장
        </Button>
      </form>
    </div>
  );
}

function SignupSettings({ section }: { section: 'signup' | 'defaults' }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: settings } = useQuery(trpc.admin.getSignupSettings.queryOptions());
  const setSettings = useMutation(trpc.admin.setSignupSettings.mutationOptions());

  function update(patch: { autoApprove?: boolean; askReason?: boolean; publicFollowerThreshold?: number }, label: string) {
    toast.promise(setSettings.mutateAsync(patch), {
      loading: '저장 중...',
      success: () => {
        void queryClient.invalidateQueries(trpc.admin.getSignupSettings.queryFilter());
        return label;
      },
      error: (error) => `저장에 실패했습니다. ${error instanceof Error ? error.message : error}`,
    });
  }

  const busy = !settings || setSettings.isPending;

  if (section === 'defaults') {
    return (
      <FollowerThresholdField
        value={settings?.publicFollowerThreshold}
        disabled={busy}
        onSave={(next) => update({ publicFollowerThreshold: next }, `팔로워 ${next.toLocaleString('ko-KR')}명 미만은 숨김으로 등록됩니다.`)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <Label htmlFor="ask-reason" className="text-sm">사유 입력칸</Label>
          <span className="text-xs text-muted-foreground">신청 화면에 사유를 적는 칸을 보입니다.</span>
        </div>
        <Switch
          id="ask-reason"
          checked={settings?.askReason ?? true}
          disabled={busy}
          onCheckedChange={(next) =>
            update({ askReason: next }, next ? '신청 화면에 사유 입력칸을 보입니다.' : '사유 입력칸을 숨겼습니다.')
          }
          aria-label="신청 화면에 사유 입력칸 표시"
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <Label htmlFor="auto-approve" className="text-sm">자동 승인</Label>
          <span className="text-xs text-muted-foreground">켜면 신청 즉시 화이트리스트에 등록됩니다. 기본 꺼짐.</span>
        </div>
        <Switch
          id="auto-approve"
          checked={settings?.autoApprove ?? false}
          disabled={busy}
          onCheckedChange={(next) =>
            update(
              { autoApprove: next },
              next ? '자동 승인을 켰습니다. 이제 신청 즉시 화이트리스트에 등록됩니다.' : '자동 승인을 껐습니다.',
            )
          }
          aria-label="신청 즉시 자동 승인"
        />
      </div>
    </div>
  );
}

/**
 * 새 스트리머 기본 공개 기준 팔로워 수 (#271) — 미만이면 목록에서 숨긴 채로 등록된다. 기존 계정에는 소급하지 않는다.
 * 입력 중에는 로컬 값, 포커스를 잃거나 Enter 로 저장
 */
function FollowerThresholdField({ value, disabled, onSave }: { value: number | undefined; disabled: boolean; onSave: (next: number) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  //  서버 값이 바뀌면 입력을 맞춘다 — 렌더 중 보정 (#200 패턴)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value === undefined ? '' : String(value));
  }

  function commit() {
    const next = Number(text);
    if (!Number.isInteger(next) || next < 0) {
      setText(value === undefined ? '' : String(value));
      return;
    }
    if (next !== value) onSave(next);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <Label htmlFor="public-follower-threshold" className="text-sm">공개 기준 팔로워</Label>
        <span className="text-xs text-muted-foreground">이 수 미만이면 목록에서 숨긴 채로 등록됩니다. 0이면 전부 공개.</span>
      </div>
      <Input
        id="public-follower-threshold"
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={text}
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        className="w-24"
        title="이 수 미만이면 새 스트리머를 목록에서 숨긴 채로 등록합니다"
      />
    </div>
  );
}

