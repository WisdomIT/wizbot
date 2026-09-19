'use client';

import { Crown, Sword } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * 치지직 채팅 모사 (#277) — 위즈봇이 채팅에서 실제로 하는 일을 대본으로 돌린다.
 * 색·글꼴·간격은 치지직 라이브 페이지 실측값(이슈 #277 코멘트). 대본은 실제 위즈봇 명령어와 응답 형식을 따른다.
 * 스트리머는 왕관, 매니저는 칼 아이콘(흰색)이 닉네임 앞에 붙고 닉네임·본문이 역할 색으로 — 봇은 보통 매니저로 지정하므로 매니저와 같게
 */
const CHZZK = {
  panelBg: '#141517',
  inputFieldBg: '#212325',
  divider: '#ffffff1a',
  textPrimary: '#ffffff',
  textSecondary: '#9da5b6',
  textPlaceholder: '#697183',
  brand: '#00FFA3',
  brandDim: '#00ffa31a',
  brandBorder: '#00ffa326',
  fontFamily: '-apple-system, system-ui, "Malgun Gothic", "맑은 고딕", Helvetica, Arial, sans-serif',
} as const;

const NICK_COLORS = ['#e2be61', '#eca843', '#ec8a43', '#ea723d', '#e56b79', '#e68199', '#e16cb5', '#bc7acc', '#a983e7', '#8b89e1', '#7194ee', '#7994d0', '#71aaed', '#5fb7e8', '#80bdd3', '#80d3ce', '#99d3ba', '#94d59a', '#bbe69a', '#cce57d'];
const ROLE = { streamer: '#d9ae41', manager: '#749ffe' } as const;

type Line = { kind: 'chat' | 'bot'; nick?: string; text: string; role?: keyof typeof ROLE; after: number };

/** 실제 위즈봇 동작 — 명령어 호출·추가·노래 신청·방송 제목 변경·채팅에서 에이전트 호출(승인은 채팅 「승인」으로) */
const SCRIPT: Line[] = [
  { kind: 'chat', nick: '구독각', text: '!디스코드', after: 900 },
  { kind: 'bot', text: '디스코드 참여 👉 https://discord.gg/wizbot', after: 1600 },
  { kind: 'chat', nick: '스트리머', role: 'streamer', text: '!추가 인사 안녕하세요! 오늘도 편하게 놀다 가세요 😊', after: 1200 },
  { kind: 'bot', text: '!인사 명령어를 추가했습니다.', after: 1400 },
  { kind: 'chat', nick: '치즈조각', text: '!인사', after: 900 },
  { kind: 'bot', text: '안녕하세요! 오늘도 편하게 놀다 가세요 😊', after: 1600 },
  { kind: 'chat', nick: '밤샘코딩', text: '!노래 신청 뉴진스 하입보이', after: 1000 },
  { kind: 'bot', text: '🎵 NewJeans - Hype Boy 를 대기열 3번째에 추가했습니다.', after: 1700 },
  { kind: 'chat', nick: '지나가던냥', text: '!노래', after: 800 },
  { kind: 'bot', text: '▶ 재생 중: IU - Love wins all (2:31 / 4:05) · 신청: 고정닉', after: 1600 },
  { kind: 'chat', nick: '매니저짱', role: 'manager', text: '!제목 신작 엔딩까지 달립니다 🎮', after: 1000 },
  { kind: 'bot', text: '방송 제목을 「신작 엔딩까지 달립니다 🎮」로 바꿨습니다.', after: 1600 },
  { kind: 'chat', nick: '스트리머', role: 'streamer', text: '!에이전트 !인사 명령어 매니저만 쓰게 바꿔줘', after: 1200 },
  { kind: 'bot', text: '⚠ 명령어 수정 — 진행하려면 "승인", 취소는 "거절"로 답해주세요.', after: 1500 },
  { kind: 'chat', nick: '스트리머', role: 'streamer', text: '승인', after: 900 },
  { kind: 'bot', text: '카드를 승인했습니다 — 실행할게요.', after: 1100 },
  { kind: 'bot', text: '!인사 명령어 권한을 매니저로 바꿨습니다.', after: 2200 },
];

type Msg = Line & { id: number; color: string };
const MAX_MESSAGES = 30;

function hashColor(nick: string) {
  let h = 0;
  for (let i = 0; i < nick.length; i++) h = (h * 31 + nick.charCodeAt(i)) >>> 0;
  return NICK_COLORS[h % NICK_COLORS.length];
}

export function DemoChat({ active }: { active: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (!active) return;
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const toMsg = (line: Line): Msg => ({ ...line, id: (idRef.current += 1), color: line.nick ? hashColor(line.nick) : CHZZK.brand });
    const push = () => {
      if (!alive) return;
      const line = SCRIPT[cursor % SCRIPT.length];
      cursor += 1;
      setMsgs((prev) => [...prev, toMsg(line)].slice(-MAX_MESSAGES));
      timer = setTimeout(push, line.after);
    };
    // 처음엔 화면이 비어 보이지 않게 앞 6줄을 즉시 채운 뒤 흘리기 시작
     
    setMsgs(SCRIPT.slice(0, 6).map(toMsg));
    cursor = 6;
    timer = setTimeout(push, 900);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [active]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  return (
    <div className="flex h-full flex-col overflow-hidden" style={{ background: CHZZK.panelBg, fontFamily: CHZZK.fontFamily, color: CHZZK.textPrimary }}>
      <style>{`@keyframes wizbot-chat-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
      <header className="flex h-12 shrink-0 items-center justify-between px-3.5" style={{ borderBottom: `1px solid ${CHZZK.divider}` }}>
        <span className="text-sm font-bold" style={{ letterSpacing: '-0.3px' }}>채팅</span>
        <span className="flex items-center gap-1 text-xs tabular-nums" style={{ color: CHZZK.textSecondary }}>
          <span className="inline-block size-1.5 rounded-full" style={{ background: CHZZK.brand }} /> 1,284
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8" style={{ background: `linear-gradient(${CHZZK.panelBg}, transparent)` }} />
        <div ref={listRef} role="log" aria-live="off" className="h-full overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-width:thin]">
          <div className="flex min-h-full flex-col justify-end">
            {msgs.map((m) => (
              <Row key={m.id} msg={m} />
            ))}
          </div>
        </div>
      </div>
      <div className="shrink-0 px-3.5 pt-3 pb-3.5" style={{ borderTop: `1px solid ${CHZZK.divider}` }}>
        <div className="flex h-10 items-center gap-2 rounded-lg px-3" style={{ background: CHZZK.inputFieldBg }}>
          <span className="text-sm" style={{ color: CHZZK.textPlaceholder }}>채팅을 입력해 주세요</span>
          <span className="ml-auto text-[11px] tabular-nums" style={{ color: CHZZK.textPlaceholder }}>0/100</span>
        </div>
      </div>
    </div>
  );
}

function Row({ msg }: { msg: Msg }) {
  const animation = 'wizbot-chat-in 180ms ease-out';
  //  봇은 매니저와 같게 — 실제로도 봇 계정을 매니저로 지정한다
  const role: keyof typeof ROLE | undefined = msg.kind === 'bot' ? 'manager' : msg.role;
  const color = role ? ROLE[role] : msg.color;
  const nick = msg.kind === 'bot' ? '위즈봇' : msg.nick;
  return (
    <div className="px-1.5 py-1 text-sm leading-5 motion-reduce:animate-none" style={{ animation }}>
      {role && (
        <span className="mr-1 inline-flex size-4 items-center justify-center rounded align-[-3px]" style={{ background: ROLE[role] }} aria-label={role === 'streamer' ? '스트리머' : '매니저'}>
          {role === 'streamer' ? <Crown className="size-3 text-white" strokeWidth={2.5} /> : <Sword className="size-3 text-white" strokeWidth={2.5} />}
        </span>
      )}
      <span className="font-medium" style={{ color }}>{nick}</span>
      <span className="ml-[5px]" style={{ color: role ? color : CHZZK.textPrimary }}>{msg.text}</span>
    </div>
  );
}
