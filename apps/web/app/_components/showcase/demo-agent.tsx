'use client';

import { SendHorizonal, ShieldQuestion, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * 에이전트 패널 모사 (#277) — 실제 패널(components/agent/agent-panel.tsx)과 같은 구성: 사용자 말풍선 → 도구 표시 → 답변,
 * 파괴적 작업은 승인 카드. 대본은 실제 도구 이름·라벨을 따른다
 */
type Step =
  | { kind: 'user'; text: string }
  | { kind: 'tool'; label: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'card'; title: string; lines: string[] };

const SCRIPT: { step: Step; after: number }[] = [
  { step: { kind: 'user', text: '!디스코드 명령어 만들어줘. 응답은 디스코드 초대 링크로' }, after: 900 },
  { step: { kind: 'tool', label: '명령어 목록 조회' }, after: 700 },
  { step: { kind: 'tool', label: '명령어 추가' }, after: 900 },
  { step: { kind: 'assistant', text: '!디스코드 명령어를 추가했습니다. 시청자가 「!디스코드」를 치면 초대 링크로 답합니다. 변경 기록에도 남았어요.' }, after: 2600 },
  { step: { kind: 'user', text: '요즘 안 쓰는 명령어 있으면 지워줘' }, after: 900 },
  { step: { kind: 'tool', label: '미사용 명령어 조회' }, after: 900 },
  { step: { kind: 'assistant', text: '최근 30일 동안 한 번도 안 쓰인 명령어는 !이벤트 하나입니다. 삭제할까요? 승인 카드를 띄웠어요.' }, after: 1200 },
  { step: { kind: 'card', title: '명령어 삭제', lines: ['!이벤트 명령어를 삭제합니다.', '삭제하면 되돌릴 수 없습니다.'] }, after: 3200 },
];

export function DemoAgent({ active }: { active: boolean }) {
  const [items, setItems] = useState<(Step & { id: number })[]>([]);
  const [typing, setTyping] = useState('');

  useEffect(() => {
    if (!active) return;
    let cursor = 0;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      if (!alive) return;
      if (cursor >= SCRIPT.length) {
        // 처음부터 — 대화를 비우고 다시
        setItems([]);
        cursor = 0;
      }
      const { step, after } = SCRIPT[cursor];
      cursor += 1;
      if (step.kind === 'user') {
        // 입력창에 타자 치듯 — 끝나면 말풍선으로
        let i = 0;
        const type = () => {
          if (!alive) return;
          i += 2;
          setTyping(step.text.slice(0, i));
          if (i < step.text.length) timer = setTimeout(type, 40);
          else {
            timer = setTimeout(() => {
              setTyping('');
              setItems((prev) => [...prev, { ...step, id: prev.length }]);
              timer = setTimeout(run, after);
            }, 350);
          }
        };
        type();
        return;
      }
      setItems((prev) => [...prev, { ...step, id: prev.length }]);
      timer = setTimeout(run, after);
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
    timer = setTimeout(run, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active]);

  return (
    <div className="flex h-full flex-col bg-background text-sm">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3 font-semibold">
        <Sparkles className="size-4 text-blue-500" /> 위즈봇 에이전트
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-hidden p-3">
        {items.map((item) => {
          if (item.kind === 'user') {
            return (
              <div key={item.id} className="ml-8 self-end rounded-lg bg-primary px-3 py-2 text-primary-foreground">
                {item.text}
              </div>
            );
          }
          if (item.kind === 'tool') {
            return (
              <div key={item.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wrench className="size-3" /> {item.label}
              </div>
            );
          }
          if (item.kind === 'card') {
            return (
              <div key={item.id} className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium">
                    <ShieldQuestion className="size-4" /> {item.title}
                  </div>
                  <Badge variant="outline">대기 중</Badge>
                </div>
                <div className="mt-1.5 flex flex-col gap-0.5 text-muted-foreground">
                  {item.lines.map((line) => <p key={line}>{line}</p>)}
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button size="sm" variant="outline" tabIndex={-1}>거절</Button>
                  <Button size="sm" tabIndex={-1}>승인</Button>
                </div>
              </div>
            );
          }
          return (
            <p key={item.id} className="leading-relaxed">{item.text}</p>
          );
        })}
      </div>
      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <span className={typing ? '' : 'text-muted-foreground'}>{typing || '무엇을 도와드릴까요?'}{typing && <span className="ml-px animate-pulse">|</span>}</span>
          <SendHorizonal className="ml-auto size-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}
