'use client';

import { Bold, Code, Italic, Link2, List, ListOrdered, Strikethrough, Table2 } from 'lucide-react';
import { useRef, useState } from 'react';

import Markdown from '@/components/custom/markdown';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * 마크다운 에디터 (#206) — 툴바로 문법을 넣어 주고, 미리보기는 실제 표시와 같은 렌더러(Markdown, GFM)를 쓴다.
 * 선택 영역이 있으면 감싸고, 없으면 자리표시 문구를 넣고 선택해 준다.
 */
const ACTIONS = [
  { icon: Bold, label: '굵게', prefix: '**', suffix: '**', placeholder: '굵은 글' },
  { icon: Italic, label: '기울임', prefix: '_', suffix: '_', placeholder: '기울인 글' },
  { icon: Strikethrough, label: '취소선', prefix: '~~', suffix: '~~', placeholder: '취소선' },
  { icon: Code, label: '코드', prefix: '`', suffix: '`', placeholder: '코드' },
  { icon: Link2, label: '링크', prefix: '[', suffix: '](https://)', placeholder: '링크 이름' },
  { icon: List, label: '목록', prefix: '\n- ', suffix: '', placeholder: '항목' },
  { icon: ListOrdered, label: '번호 목록', prefix: '\n1. ', suffix: '', placeholder: '항목' },
  { icon: Table2, label: '표', prefix: '\n| 제목 | 제목 |\n| --- | --- |\n| ', suffix: ' |  |\n', placeholder: '내용' },
] as const;

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 12,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insert(action: (typeof ACTIONS)[number]) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd } = textarea;
    const selected = value.slice(selectionStart, selectionEnd) || action.placeholder;
    const next = value.slice(0, selectionStart) + action.prefix + selected + action.suffix + value.slice(selectionEnd);
    onChange(next);
    //  넣은 문구를 선택 상태로 되돌려 바로 덮어쓸 수 있게
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selectionStart + action.prefix.length, selectionStart + action.prefix.length + selected.length);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <div className="mr-auto flex items-center gap-0.5">
          {ACTIONS.map((action) => (
            <Button key={action.label} type="button" variant="ghost" size="icon" className="size-8" title={action.label} aria-label={action.label} disabled={tab === 'preview'} onClick={() => insert(action)}>
              <action.icon className="size-4" />
            </Button>
          ))}
        </div>
        <Button type="button" size="sm" variant={tab === 'write' ? 'secondary' : 'ghost'} onClick={() => setTab('write')}>작성</Button>
        <Button type="button" size="sm" variant={tab === 'preview' ? 'secondary' : 'ghost'} onClick={() => setTab('preview')}>미리보기</Button>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? '마크다운으로 작성합니다. 표·체크박스·취소선(GFM)을 지원합니다.'}
        rows={rows}
        className={cn('font-mono text-sm', tab === 'preview' && 'hidden')}
      />
      <div className={cn('min-h-40 rounded-md border p-4', tab === 'write' && 'hidden')}>
        {value.trim() ? <Markdown>{value}</Markdown> : <p className="text-sm text-muted-foreground">내용이 없습니다.</p>}
      </div>
    </div>
  );
}
