import * as Icons from 'lucide-react';

type LucideIconName = keyof typeof Icons;

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
  const IconComponent = Icons[name as LucideIconName] as React.FC<{
    size?: number;
    color?: string;
    className?: string;
  }>;

  if (!IconComponent) return <span>⚠️</span>;

  return <IconComponent size={size} color={color} className={className} />;
}
