'use client';

import { DynamicIcon as LucideDynamicIcon, type IconName } from 'lucide-react/dynamic';

/**
 * 이름(문자열)으로 lucide 아이콘을 렌더한다 (#25).
 *
 * 기존 `import * as Icons from 'lucide-react'` 는 아이콘 전체(1,500+)를 클라이언트 번들에
 * 포함시켰다 (/list First Load 301kB 의 주범). lucide-react/dynamic 은 아이콘별 청크를
 * lazy 로드한다.
 *
 * DB(UserShortcut.icon)에는 PascalCase 이름(예: BotMessageSquare)이 저장돼 있으므로
 * kebab-case 로 변환해 넘긴다. 알 수 없는 이름은 ⚠️ 폴백.
 */
function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
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
  const iconName = pascalToKebab(name) as IconName;

  return (
    <LucideDynamicIcon
      name={iconName}
      size={size}
      color={color}
      className={className}
      fallback={() => <span>⚠️</span>}
    />
  );
}
