'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useTRPC } from '@/src/utils/trpc-react';

/** 계정 설정 (#7) — 채널 정보, 목록 노출, 챗봇 사용, 탈퇴 */
export function AccountSettingsView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isPending, error } = useQuery(trpc.user.getAccount.queryOptions());

  const invalidate = () => void queryClient.invalidateQueries(trpc.user.getAccount.queryFilter());

  const refresh = useMutation(trpc.user.refreshChannelInfo.mutationOptions());
  const setListed = useMutation(trpc.user.setListed.mutationOptions());
  const setChatbotActive = useMutation(trpc.user.setChatbotActive.mutationOptions());

  if (isPending) {
    return (
      <div className="flex flex-col gap-4 py-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-sm text-muted-foreground">
        설정을 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  function handleRefresh() {
    toast.promise(refresh.mutateAsync(), {
      loading: '치지직에서 채널 정보를 가져오는 중입니다...',
      success: (updated) => {
        invalidate();
        return `채널 정보를 갱신했습니다: ${updated.channelName}`;
      },
      error: (err) => `갱신에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  function handleListedChange(next: boolean) {
    toast.promise(setListed.mutateAsync({ listed: next }), {
      loading: '변경 중...',
      success: () => {
        invalidate();
        return next ? '목록에 표시됩니다.' : '목록에서 숨겨집니다.';
      },
      error: (err) => `변경에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  function handleChatbotChange(next: boolean) {
    toast.promise(setChatbotActive.mutateAsync({ active: next }), {
      loading: '변경 중...',
      success: () => {
        invalidate();
        return next
          ? '챗봇을 켰습니다. 1분 내에 채팅에 연결됩니다.'
          : '챗봇을 껐습니다. 1분 내에 연결이 해제됩니다.';
      },
      error: (err) => `변경에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>채널 정보</CardTitle>
          <CardDescription>
            치지직 채널명이나 프로필 이미지를 바꿨다면 새로고침해 반영하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={data.channelImageUrl ?? undefined} />
            <AvatarFallback>{data.channelName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{data.channelName}</span>
            <span className="font-mono text-xs text-muted-foreground">{data.channelId}</span>
          </div>
          <Button
            variant="outline"
            className="ml-auto"
            onClick={handleRefresh}
            disabled={refresh.isPending}
          >
            <RefreshCw className="size-4" />
            새로고침
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>공개 설정</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SettingRow
            title="스트리머 목록에 표시"
            description="메인 페이지와 스트리머 목록에 채널을 노출합니다. 꺼도 시청자 페이지 링크는 그대로 열립니다."
            checked={data.listed}
            disabled={setListed.isPending}
            onChange={handleListedChange}
          />
          <SettingRow
            title="챗봇 사용"
            description="끄면 채팅 응답과 반복 메시지가 모두 중단됩니다. 명령어 설정은 그대로 보관됩니다."
            checked={data.chatbotActive}
            disabled={setChatbotActive.isPending}
            onChange={handleChatbotChange}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">위험 구역</CardTitle>
          <CardDescription>
            탈퇴하면 명령어·반복 메시지·설정·치지직 연동이 모두 삭제되며 복구할 수 없습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog channelName={data.channelName} />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function DeleteAccountDialog({ channelName }: { channelName: string }) {
  const trpc = useTRPC();
  const deleteSelf = useMutation(trpc.user.deleteSelf.mutationOptions());
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  function handleDelete() {
    toast.promise(deleteSelf.mutateAsync(), {
      loading: '탈퇴 처리 중...',
      success: () => {
        // 세션까지 정리하고 메인으로
        setTimeout(() => {
          window.location.href = '/login/logout';
        }, 1000);
        return '탈퇴가 완료되었습니다.';
      },
      error: (err) => `탈퇴에 실패했습니다. ${err instanceof Error ? err.message : err}`,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmText('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">탈퇴하기</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>정말 탈퇴하시겠습니까?</DialogTitle>
          <DialogDescription>
            명령어·반복 메시지·설정·치지직 연동이 모두 삭제되며 복구할 수 없습니다. 계속하려면
            채널명을 입력하세요.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder={channelName}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">취소</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={confirmText !== channelName || deleteSelf.isPending}
          >
            탈퇴하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
