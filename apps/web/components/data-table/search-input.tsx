'use client';

import { useEffect, useState } from 'react';

import { Input } from '@/components/ui/input';

/**
 * 디바운스 검색창 (#265) — 타이핑은 로컬 state, 멈추면 `onChange` 로 올린다 (URL 상태와 짝).
 * 바깥 값이 바뀌면(초기화 버튼·뒤로가기) 입력도 따라간다.
 */
export function SearchInput({
  value,
  onChange,
  delay = 300,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  delay?: number;
}) {
  const [text, setText] = useState(value);

  //  바깥 값이 바뀌면 입력을 맞춘다 — 렌더 중 보정 (#200 패턴)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value);
  }

  useEffect(() => {
    if (text === value) return;
    const timer = setTimeout(() => onChange(text), delay);
    return () => clearTimeout(timer);
  }, [text, value, delay, onChange]);

  return <Input {...props} value={text} onChange={(event) => setText(event.target.value)} />;
}
