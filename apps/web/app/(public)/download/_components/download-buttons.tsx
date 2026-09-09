'use client';

import { Download } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';

import { DOWNLOADS, downloadUrl, type Platform } from '../_lib/downloads';

/**
 * ⚠️ 브라우저는 Apple Silicon 과 Intel 을 구분하지 못한다 — Chrome 은 Apple Silicon 에서도
 * UA 에 `Intel Mac OS X` 로 보고한다. 그래서 macOS 로 감지되면 **두 버튼 모두 강조**하고
 * 사용자가 고르게 한다 (#117).
 */
//  플랫폼은 세션 중 바뀌지 않는다 — 구독할 것이 없다
function subscribeNever() {
  return () => {};
}

function detectPlatform(): Platform | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/Mac/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'windows';
  return null;
}

export function DownloadButtons() {
  //  서버에서는 접속 환경을 알 수 없다 — 서버 스냅샷은 null(정의된 순서 그대로)이고
  //  클라이언트에서 감지값을 쓴다 (hydration 불일치 방지, #200: effect 대신 useSyncExternalStore)
  const platform = useSyncExternalStore(subscribeNever, detectPlatform, () => null);

  //  쓰지 않는 환경의 버튼도 항상 노출한다 — 다른 기기에 설치하려는 경우가 있다.
  //  sort 는 안정 정렬이라 같은 플랫폼 안의 순서(Apple Silicon → Intel)는 유지된다.
  const targets = platform
    ? [...DOWNLOADS].sort(
        (a, b) => Number(b.platform === platform) - Number(a.platform === platform),
      )
    : DOWNLOADS;

  return (
    <div className="flex flex-col sm:flex-row gap-3 w-full">
      {targets.map((target) => {
        const current = target.platform === platform;
        return (
          <Button
            key={target.id}
            asChild
            size="lg"
            variant={current ? 'default' : 'outline'}
            className="flex-1 h-auto py-3 justify-start"
          >
            <a href={downloadUrl(target)}>
              <Download className="shrink-0" />
              <span className="flex flex-col items-start leading-tight">
                <span>{target.label}</span>
                <span className="text-xs opacity-70 font-normal">{target.hint}</span>
              </span>
            </a>
          </Button>
        );
      })}
    </div>
  );
}
