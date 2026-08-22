'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

/**
 * 단축키 조합 입력 (#85).
 *
 * 누른 키를 그대로 받아 Electron accelerator 문자열로 만든다.
 * 수식키(⌘/Ctrl/Alt/Shift)가 하나 이상 있어야 하고, ⌘ 와 Ctrl 은
 * 플랫폼에 맞춰 동작하도록 CommandOrControl 로 합친다.
 */
const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'Shift']);

function toAccelerator(event: React.KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (parts.length === 0) return null;

  // 문자·숫자만 받는다. Shift 를 눌러도 원래 키를 쓰도록 code 에서 뽑는다
  const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
  const digit = /^Digit([0-9])$/.exec(event.code)?.[1];
  const key = letter ?? digit;
  if (!key) return null;

  return [...parts, key].join('+');
}

/** 화면에 보여줄 때는 기호로 (⌘/Ctrl 은 플랫폼에 따라 다르므로 둘 다 적는다) */
export function formatAccelerator(accelerator: string) {
  return accelerator.replace('CommandOrControl', '⌘/Ctrl').replaceAll('+', ' + ');
}

export function ShortcutInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (accelerator: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLButtonElement>(null);

  // 키를 받으려면 포커스가 있어야 한다 (autoFocus 는 a11y 규칙에 걸린다)
  useEffect(() => {
    if (capturing) captureRef.current?.focus();
  }, [capturing]);

  if (!capturing) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-44 justify-center font-mono text-xs"
        onClick={() => setCapturing(true)}
      >
        {formatAccelerator(value)}
      </Button>
    );
  }

  return (
    <Button
      ref={captureRef}
      variant="secondary"
      size="sm"
      className="w-44 justify-center text-xs"
      onBlur={() => setCapturing(false)}
      onKeyDown={(event) => {
        event.preventDefault();

        if (event.key === 'Escape') {
          setCapturing(false);
          return;
        }

        const accelerator = toAccelerator(event);
        if (!accelerator) return;

        onChange(accelerator);
        setCapturing(false);
      }}
    >
      키를 누르세요…
    </Button>
  );
}
