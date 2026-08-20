'use client';

import { iconNames } from 'lucide-react/dynamic';
import { useMemo, useState } from 'react';

import { DynamicIcon } from '@/components/custom/dynamic-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * lucide 아이콘 피커 (#7 A2) — 실제 아이콘을 그려서 고른다.
 *
 * 전체 아이콘(1,600여 개)을 한 번에 렌더하면 그만큼 lazy 청크를 받으므로,
 * 기본은 큐레이션 목록만 보여주고 검색 시 매칭 결과를 MAX_RESULTS 개까지만 그린다.
 * 값은 DB 호환을 위해 PascalCase 로 주고받는다 (렌더는 DynamicIcon 이 kebab 으로 변환).
 */

const MAX_RESULTS = 60;

/** 스트리머가 자주 쓸 만한 아이콘 (kebab-case) */
const CURATED = [
  'youtube',
  'twitch',
  'instagram',
  'twitter',
  'facebook',
  'github',
  'linkedin',
  'slack',
  'coffee',
  'cup-soda',
  'message-circle',
  'message-square',
  'mail',
  'send',
  'phone',
  'rss',
  'globe',
  'link',
  'external-link',
  'house',
  'store',
  'shopping-bag',
  'shopping-cart',
  'gift',
  'music',
  'headphones',
  'mic',
  'radio',
  'video',
  'film',
  'clapperboard',
  'gamepad-2',
  'calendar',
  'clock',
  'star',
  'heart',
  'thumbs-up',
  'award',
  'crown',
  'sparkles',
  'book-open',
  'newspaper',
  'image',
  'camera',
  'palette',
  'pen-tool',
  'users',
  'hand-coins',
] as const;

function kebabToPascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function pascalToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

export function IconPicker({
  value,
  onChange,
}: {
  /** PascalCase 아이콘 이름 (DB 저장 형식) */
  value: string;
  onChange: (icon: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const results = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/\s+/g, '-');
    if (!query) return [...CURATED];

    const matched = (iconNames as readonly string[]).filter((name) => name.includes(query));
    // 검색어로 시작하는 이름을 앞으로
    matched.sort((a, b) => {
      const aStarts = a.startsWith(query) ? 0 : 1;
      const bStarts = b.startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    });
    return matched.slice(0, MAX_RESULTS);
  }, [search]);

  const selectedKebab = value ? pascalToKebab(value) : '';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch('');
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="justify-start gap-2">
          {value ? <DynamicIcon name={value} size={18} /> : null}
          <span className="text-muted-foreground">{value || '아이콘 선택'}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>아이콘 선택</DialogTitle>
          <DialogDescription>
            자주 쓰는 아이콘을 먼저 보여줍니다. 영문으로 검색하면 전체 아이콘에서 찾습니다 (예:
            youtube, cafe → coffee).
          </DialogDescription>
        </DialogHeader>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="아이콘 검색 (영문)"
        />
        <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto">
          {results.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => {
                onChange(kebabToPascal(name));
                setOpen(false);
                setSearch('');
              }}
              className={cn(
                'flex aspect-square items-center justify-center rounded-md border transition-colors hover:bg-accent',
                selectedKebab === name ? 'border-primary bg-accent' : 'border-transparent',
              )}
            >
              <DynamicIcon name={kebabToPascal(name)} size={20} />
            </button>
          ))}
        </div>
        {results.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            검색 결과가 없습니다. 영문 이름으로 검색해보세요.
          </p>
        )}
        {search.trim() && results.length === MAX_RESULTS && (
          <p className="text-xs text-muted-foreground">
            상위 {MAX_RESULTS}개만 표시합니다. 검색어를 더 구체적으로 입력해보세요.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
