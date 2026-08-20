'use client';

import { DynamicIcon as LucideDynamicIcon, type IconName, iconNames } from 'lucide-react/dynamic';

import { cn } from '@/lib/utils';

/**
 * 이름(문자열)으로 lucide 아이콘을 렌더한다 (#25, #7).
 *
 * 이름 해석: 대소문자·하이픈을 무시한 정규화 키로 매칭한다.
 *   'Gamepad2' · 'gamepad-2' · 'gamepad2' → 모두 lucide 의 'gamepad-2'
 * 단순 Pascal↔kebab 변환은 숫자가 낀 이름에서 하이픈이 사라져 되돌릴 수 없었다
 * (Gamepad2 → gamepad2 ≠ gamepad-2 → 렌더 실패). DB 에 남아 있는 PascalCase 값도
 * 이 방식으로 그대로 해석된다.
 */
const iconNameByKey = new Map<string, IconName>(
  (iconNames as readonly IconName[]).map((name) => [normalizeIconKey(name), name]),
);

function normalizeIconKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 입력 이름을 실제 lucide 아이콘 이름으로. 없으면 null */
export function resolveIconName(name: string): IconName | null {
  return iconNameByKey.get(normalizeIconKey(name)) ?? null;
}

interface DynamicIconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}

export function DynamicIcon({
  name,
  size = 24,
  color = 'currentColor',
  className = '',
}: DynamicIconProps) {
  const iconName = resolveIconName(name);

  // 알 수 없는 이름 — 로딩과 구분해서 표시한다
  if (!iconName) {
    return (
      <span title={`알 수 없는 아이콘: ${name}`} className={className}>
        ⚠️
      </span>
    );
  }

  return (
    <LucideDynamicIcon
      name={iconName}
      size={size}
      color={color}
      className={className}
      // 청크를 받는 동안의 자리표시자 (이전에는 ⚠️ 가 떠서 오류처럼 보였다)
      fallback={() => (
        <span
          role="status"
          aria-label="아이콘 불러오는 중"
          className={cn('inline-block animate-pulse rounded-sm bg-muted', className)}
          style={{ width: size, height: size }}
        />
      )}
    />
  );
}
