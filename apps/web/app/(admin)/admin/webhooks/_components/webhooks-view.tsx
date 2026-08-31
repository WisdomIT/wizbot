'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/src/utils/trpc-react';

/**
 * 운영 알림 디스코드 웹훅 (#207). 종류별로 채널을 나눠 받도록 엔드포인트를 따로 두고,
 * 재배포 없이 바꾸도록 DB 로 관리한다. URL 은 비밀값이라 등록 후에는 끝 4자만 보인다.
 */
export function WebhooksView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.notify.webhooks.queryOptions());

  if (isPending || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex max-w-2xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>디스코드 웹훅</CardTitle>
          <CardDescription>
            운영 알림(메일과 동일한 내용)을 디스코드 채널로도 받습니다. 디스코드에서 채널 → 연동 → 웹훅을 만들어 URL 을 붙여넣으세요.
            종류마다 다른 채널의 웹훅을 등록할 수 있고, 「테스트」는 비활성 상태여도 발송됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {data.map((row) => (
            <WebhookRow key={row.kind} row={row} onChanged={() => queryClient.invalidateQueries(trpc.notify.webhooks.queryFilter())} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

interface RowData {
  kind: 'SESSION_EXPIRED' | 'SIGNUP' | 'CAFE_JOIN' | 'INQUIRY' | 'ERROR';
  label: string;
  configured: boolean;
  enabled: boolean;
  maskedUrl: string | null;
  updatedAt: Date | string | null;
}

function WebhookRow({ row, onChanged }: { row: RowData; onChanged: () => void }) {
  const trpc = useTRPC();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const setWebhook = useMutation(trpc.notify.setWebhook.mutationOptions());
  const setEnabled = useMutation(trpc.notify.setEnabled.mutationOptions());
  const test = useMutation(trpc.notify.test.mutationOptions());
  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

  function handleSave() {
    toast.promise(setWebhook.mutateAsync({ kind: row.kind, url, enabled: true }), {
      loading: '저장 중...',
      success: () => {
        setEditing(false);
        setUrl('');
        onChanged();
        return `${row.label} 웹훅을 저장했습니다. 「테스트」로 확인해보세요.`;
      },
      error: errorText,
    });
  }

  function handleRemove() {
    toast.promise(setWebhook.mutateAsync({ kind: row.kind, url: null, enabled: false }), {
      loading: '삭제 중...',
      success: () => {
        onChanged();
        return `${row.label} 웹훅을 삭제했습니다.`;
      },
      error: errorText,
    });
  }

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{row.label}</span>
          {row.configured ? (
            <Badge variant={row.enabled ? 'default' : 'secondary'}>{row.enabled ? '켜짐' : '꺼짐'}</Badge>
          ) : (
            <Badge variant="outline">미등록</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {row.configured && (
            <>
              <Switch
                checked={row.enabled}
                disabled={setEnabled.isPending}
                onCheckedChange={(checked) =>
                  toast.promise(setEnabled.mutateAsync({ kind: row.kind, enabled: checked }), {
                    loading: '변경 중...',
                    success: () => {
                      onChanged();
                      return checked ? `${row.label} 알림을 켰습니다.` : `${row.label} 알림을 껐습니다.`;
                    },
                    error: errorText,
                  })
                }
              />
              <Button
                size="sm"
                variant="outline"
                disabled={test.isPending}
                onClick={() =>
                  toast.promise(test.mutateAsync({ kind: row.kind }), {
                    loading: '발송 중...',
                    success: '테스트 메시지를 보냈습니다. 디스코드 채널을 확인해주세요.',
                    error: errorText,
                  })
                }
              >
                테스트
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setEditing((prev) => !prev)}>
            {editing ? '취소' : row.configured ? '변경' : '등록'}
          </Button>
          {row.configured && (
            <Button size="sm" variant="destructive" disabled={setWebhook.isPending} onClick={handleRemove}>
              삭제
            </Button>
          )}
        </div>
      </div>
      {row.configured && !editing && (
        <p className="text-xs text-muted-foreground">
          URL <span className="font-mono">{row.maskedUrl}</span>
          {row.updatedAt ? ` · ${new Date(row.updatedAt).toLocaleString('ko-KR')} 저장` : ''}
        </p>
      )}
      {editing && (
        <div className="flex gap-2">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
            className="font-mono text-xs"
          />
          <Button size="sm" disabled={setWebhook.isPending || !url.trim()} onClick={handleSave}>
            저장
          </Button>
        </div>
      )}
    </div>
  );
}
