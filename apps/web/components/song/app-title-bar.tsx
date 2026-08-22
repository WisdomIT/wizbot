'use client';

import { Minus, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';

import { DRAG, NO_DRAG } from './drag-region';

/**
 * 앱 자체 타이틀바 (#85).
 *
 * - **macOS**: 시스템 신호등 버튼을 그대로 쓴다. 왼쪽에 자리만 비운다
 * - **Windows**: 시스템 버튼은 어두운 사각형으로 떠 밝은 화면과 어울리지 않아 직접 그린다
 */
const MAC_TRAFFIC_LIGHTS = 78;

export function AppTitleBar({
  platform,
  controls,
  children,
  className = '',
}: {
  platform: string;
  /** 창 제어 (Windows 에서만 쓴다) */
  controls?: { minimize: () => void; toggleMaximize: () => void; close: () => void };
  /** 왼쪽 영역에 놓을 버튼들 (모드 전환 등) */
  children?: ReactNode;
  className?: string;
}) {
  const mac = platform === 'darwin';

  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-1 ${className}`}
      style={{ ...DRAG, paddingLeft: mac ? MAC_TRAFFIC_LIGHTS : 8 }}
    >
      {/* 버튼은 끌기 영역에서 빼야 눌린다 */}
      <div className="flex items-center gap-1" style={NO_DRAG}>
        {children}
      </div>

      <div className="flex-1" />

      {!mac && controls && (
        <div className="flex items-center" style={NO_DRAG}>
          <Button variant="ghost" size="icon" aria-label="최소화" onClick={controls.minimize}>
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="최대화"
            onClick={controls.toggleMaximize}
          >
            <Square className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="닫기"
            className="hover:bg-destructive hover:text-white"
            onClick={controls.close}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
