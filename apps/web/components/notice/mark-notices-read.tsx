'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useTRPC } from '@/src/utils/trpc-react';

/** 공지 목록을 열면 전부 읽음 처리 — 사이드바 점 표시가 꺼진다 (#206 2/3) */
export function MarkNoticesRead() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const markAllRead = useMutation(trpc.notice.markAllRead.mutationOptions());
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    markAllRead.mutate(undefined, {
      onSuccess: () => void queryClient.invalidateQueries(trpc.notice.unread.queryFilter()),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
