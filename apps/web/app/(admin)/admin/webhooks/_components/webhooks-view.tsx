'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <ChannelTogglesCard />
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
      <MailSettingsCard />
    </div>
  );
}

/** 알림 채널 토글 — 켜진 채널로만 운영 알림 발송. 관리자 로그인 메일 등 기본 동작은 영향 없다 */
function ChannelTogglesCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.notify.channels.queryOptions());
  const setChannel = useMutation(trpc.notify.setChannel.mutationOptions());

  if (isPending || !data) return <Skeleton className="h-28 w-full" />;

  const rows = [
    { channel: 'email' as const, label: '이메일 알림 발송', enabled: data.email },
    { channel: 'discord' as const, label: '디스코드 알림 발송', enabled: data.discord },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>알림 채널</CardTitle>
        <CardDescription>
          꺼진 채널로는 운영 알림이 발송되지 않습니다. 관리자 로그인 메일 등 기본 동작과 「테스트 발송」은 토글과 무관합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {rows.map((row) => (
          <div key={row.channel} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
            <span className="text-sm font-medium">{row.label}</span>
            <Switch
              checked={row.enabled}
              disabled={setChannel.isPending}
              onCheckedChange={(checked) =>
                toast.promise(setChannel.mutateAsync({ channel: row.channel, enabled: checked }), {
                  loading: '변경 중...',
                  success: () => {
                    void queryClient.invalidateQueries(trpc.notify.channels.queryFilter());
                    return checked ? `${row.label}을 켰습니다.` : `${row.label}을 껐습니다.`;
                  },
                  error: (err) => (err instanceof Error ? err.message : String(err)),
                })
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** SMTP 설정 (#215) — DB 우선, 없으면 SMTP_* 환경변수 폴백. 관리자 로그인 메일도 이 설정을 쓴다 */
function MailSettingsCard() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery(trpc.notify.mailSettings.queryOptions());
  const save = useMutation(trpc.notify.setMailSettings.mutationOptions());
  const reset = useMutation(trpc.notify.resetMailSettings.mutationOptions());
  const test = useMutation(trpc.notify.testMail.mutationOptions());
  const [form, setForm] = useState<{ host: string; port: string; user: string; pass: string; sender: string } | null>(null);
  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
  const refresh = () => queryClient.invalidateQueries(trpc.notify.mailSettings.queryFilter());

  if (isPending || !data) return <Skeleton className="h-40 w-full" />;

  function startEdit() {
    if (!data) return;
    setForm({ host: data.host, port: String(data.port), user: data.user, pass: '', sender: data.sender });
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    toast.promise(save.mutateAsync({ host: form.host, port: Number(form.port) || 465, user: form.user, pass: form.pass, sender: form.sender }), {
      loading: '저장 중...',
      success: () => {
        setForm(null);
        refresh();
        return 'SMTP 설정을 저장했습니다. 「테스트 발송」으로 확인해주세요.';
      },
      error: errorText,
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>메일 (SMTP)</CardTitle>
          <Badge variant={data.source === 'db' ? 'default' : 'secondary'}>{data.source === 'db' ? 'DB 설정' : '환경변수'}</Badge>
        </div>
        <CardDescription>
          운영 알림 메일과 관리자 로그인 메일이 이 설정으로 발송됩니다. DB 설정이 없으면 환경변수(SMTP_*)를 사용하고,
          잘못 저장한 경우 「환경변수로 되돌리기」로 복구할 수 있습니다. 저장 후에는 반드시 「테스트 발송」으로 확인해주세요 —
          관리자 로그인도 이 메일에 의존합니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!form ? (
          <>
            <div className="grid gap-1 text-sm">
              <SettingRow k="호스트" v={`${data.host || '(비어 있음)'} : ${data.port}`} />
              <SettingRow k="계정" v={data.user || '(비어 있음)'} />
              <SettingRow k="비밀번호" v={data.hasPass ? '설정됨' : '(비어 있음)'} />
              <SettingRow k="보내는 주소" v={data.sender || '(비어 있음)'} />
            </div>
            <div className="flex justify-end gap-2">
              {data.source === 'db' && (
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={reset.isPending}
                  onClick={() =>
                    toast.promise(reset.mutateAsync(), {
                      loading: '되돌리는 중...',
                      success: () => {
                        refresh();
                        return '환경변수 설정으로 되돌렸습니다.';
                      },
                      error: errorText,
                    })
                  }
                >
                  환경변수로 되돌리기
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={test.isPending}
                onClick={() =>
                  toast.promise(test.mutateAsync(), {
                    loading: '발송 중...',
                    success: '관리자 전원에게 테스트 메일을 보냈습니다. 수신함을 확인해주세요.',
                    error: errorText,
                  })
                }
              >
                테스트 발송
              </Button>
              <Button size="sm" onClick={startEdit}>
                {data.source === 'db' ? '변경' : 'DB 로 등록'}
              </Button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSave} className="grid gap-3">
            <div className="grid grid-cols-[1fr_8rem] gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="smtp-host">호스트</Label>
                <Input id="smtp-host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.example.com" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="smtp-port">포트</Label>
                <Input id="smtp-port" inputMode="numeric" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="smtp-user">계정</Label>
              <Input id="smtp-user" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="smtp-pass">비밀번호</Label>
              <Input
                id="smtp-pass"
                type="password"
                value={form.pass}
                onChange={(e) => setForm({ ...form, pass: e.target.value })}
                autoComplete="new-password"
                placeholder={data.hasPass && data.source === 'db' ? '변경할 때만 입력' : ''}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="smtp-sender">보내는 주소</Label>
              <Input id="smtp-sender" value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} placeholder="no-reply@example.com" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setForm(null)}>
                취소
              </Button>
              <Button type="submit" size="sm" disabled={save.isPending}>
                저장
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function SettingRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
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
