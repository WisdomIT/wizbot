'use client';

import type { ReactNode } from 'react';

import { DRAG, NO_DRAG } from './drag-region';

/**
 * 앱 자체 타이틀바 (#85).
 *
 * 창 제어 버튼은 OS 것을 그대로 쓴다 — macOS 는 신호등 버튼이 그대로 떠 있고,
 * Windows 는 titleBarOverlay 로 시스템 버튼이 화면 위에 그려진다.
 * 그래서 여기서는 **버튼이 놓일 자리만 비우고** 나머지를 끌기 영역으로 만든다.
 */
const MAC_TRAFFIC_LIGHTS = 78;
const WINDOWS_CONTROLS = 140;

export function AppTitleBar({
  platform,
  children,
  className = '',
}: {
  platform: string;
  /** 오른쪽(macOS) 또는 왼쪽(Windows)에 놓을 버튼들 */
  children?: ReactNode;
  className?: string;
}) {
  const mac = platform === 'darwin';

  return (
    <div
      className={`flex h-10 shrink-0 items-center gap-1 ${className}`}
      style={{
        ...DRAG,
        paddingLeft: mac ? MAC_TRAFFIC_LIGHTS : 8,
        paddingRight: mac ? 8 : WINDOWS_CONTROLS,
      }}
    >
      <div className="flex-1" />
      {/* 버튼은 끌기 영역에서 빼야 눌린다 */}
      <div className="flex items-center gap-1" style={NO_DRAG}>
        {children}
      </div>
    </div>
  );
}
