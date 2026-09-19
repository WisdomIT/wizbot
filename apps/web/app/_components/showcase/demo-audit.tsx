'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * 변경 기록 데모 (#277) — 설정 › 변경 기록 표의 축소판. 본인·매니저·에이전트·챗봇 행위자가 섞여 쌓인다
 */
type Actor = '본인' | '매니저' | '에이전트' | '챗봇';
const ACTOR_VARIANT: Record<Actor, 'default' | 'secondary' | 'outline'> = { 본인: 'default', 매니저: 'secondary', 에이전트: 'outline', 챗봇: 'outline' };

const ROWS: { at: string; actor: Actor; who: string; action: string; detail: string }[] = [
  { at: '20:41', actor: '에이전트', who: '대화 #128', action: '명령어 추가', detail: '!디스코드 → https://discord.gg/wizbot' },
  { at: '20:38', actor: '매니저', who: '매니저짱', action: '반복 메시지 수정', detail: '「구독 안내」 300초 → 600초' },
  { at: '20:31', actor: '챗봇', who: '스트리머 (채팅)', action: '명령어 추가', detail: '!인사 (채팅 !추가)' },
  { at: '20:12', actor: '본인', who: '위즈', action: '노래 신청 설정 변경', detail: '1인당 1곡 → 2곡' },
  { at: '19:55', actor: '에이전트', who: '대화 #127', action: '자막 설정 변경', detail: 'TIMED 15초 → ALWAYS' },
  { at: '19:40', actor: '매니저', who: '매니저짱', action: '방송 설정 변경', detail: '카테고리 → 리그 오브 레전드' },
  { at: '19:02', actor: '본인', who: '위즈', action: '테마 변경', detail: '강조색 #3b82f6 · 글꼴 주아' },
];

export function DemoAudit({ active }: { active: boolean }) {
  const [count, setCount] = useState(3);
  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCount(3);
    const timer = setInterval(() => setCount((c) => (c >= ROWS.length ? 3 : c + 1)), 1800);
    return () => clearInterval(timer);
  }, [active]);
  //  최근 것이 위 — 새 행이 맨 위에 끼어든다
  const rows = ROWS.slice(ROWS.length - count);

  return (
    <div className="flex h-full flex-col bg-background text-xs">
      <style>{`@keyframes wizbot-row-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }`}</style>
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
        <span className="text-sm font-semibold">변경 기록</span>
        <span className="text-muted-foreground">누가 · 언제 · 무엇을</span>
      </div>
      <div className="grid grid-cols-[3rem_5.5rem_1fr] gap-2 border-b bg-muted/40 px-3 py-1.5 font-semibold text-muted-foreground sm:grid-cols-[3rem_5.5rem_7rem_1fr]">
        <span>시각</span><span>행위자</span><span className="hidden sm:block">변경</span><span>내용</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-hidden">
        {rows.map((row) => (
          <li key={`${row.at}-${row.action}`} className="grid grid-cols-[3rem_5.5rem_1fr] items-center gap-2 border-b px-3 py-2 motion-reduce:animate-none sm:grid-cols-[3rem_5.5rem_7rem_1fr]" style={{ animation: 'wizbot-row-in 220ms ease-out' }}>
            <span className="tabular-nums text-muted-foreground">{row.at}</span>
            <span className="flex flex-col items-start gap-0.5">
              <Badge variant={ACTOR_VARIANT[row.actor]} className="px-1.5 py-0 text-[10px]">{row.actor}</Badge>
              <span className="truncate text-[10px] text-muted-foreground">{row.who}</span>
            </span>
            <span className="hidden truncate font-medium sm:block">{row.action}</span>
            <span className="truncate text-muted-foreground"><span className="font-medium text-foreground sm:hidden">{row.action} · </span>{row.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
