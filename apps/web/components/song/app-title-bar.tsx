'use client';

import { Minus, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';

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
  canMaximize = true,
  compact = false,
  children,
  className = '',
}: {
  platform: string;
  /** 창 제어 (Windows 에서만 쓴다) */
  controls?: { minimize: () => void; toggleMaximize: () => void; close: () => void };
  /** 미니 모드는 크기가 묶여 있어 최대화를 막는다 */
  canMaximize?: boolean;
  /** 미니 모드용 낮은 높이 */
  compact?: boolean;
  /** 왼쪽 영역에 놓을 버튼들 (모드 전환 등) */
  children?: ReactNode;
  className?: string;
}) {
  const mac = platform === 'darwin';

  return (
    <div
      className={`flex shrink-0 items-center gap-1 ${compact ? 'h-8' : 'h-10'} ${className}`}
      style={{ ...DRAG, paddingLeft: mac ? MAC_TRAFFIC_LIGHTS : 0 }}
    >
      {/* 버튼은 끌기 영역에서 빼야 눌린다 */}
      <div className="flex items-center gap-1 px-1" style={NO_DRAG}>
        {children}
      </div>

      <div className="flex-1" />

      {!mac && controls && (
        // 시스템 창 버튼처럼 모서리에 딱 붙고 높이를 꽉 채운다
        <div className="flex h-full items-stretch" style={NO_DRAG}>
          <WindowButton label="최소화" onClick={controls.minimize}>
            <Minus className="size-4" />
          </WindowButton>
          {canMaximize && (
            <WindowButton label="최대화" onClick={controls.toggleMaximize}>
              <Square className="size-3" />
            </WindowButton>
          )}
          <WindowButton label="닫기" danger onClick={controls.close}>
            <X className="size-4" />
          </WindowButton>
        </div>
      )}
    </div>
  );
}

function WindowButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex w-11 items-center justify-center text-muted-foreground transition-colors ${
        danger ? 'hover:bg-destructive hover:text-white' : 'hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
