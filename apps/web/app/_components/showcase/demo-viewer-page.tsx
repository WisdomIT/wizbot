'use client';

import { THEME_FONTS, type ThemeFontKey, type ThemeInput } from '@wizbot/shared/lib/theme';
import { BotMessageSquare, History, ListMusic, Music } from 'lucide-react';
import { useState } from 'react';

import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { cn } from '@/lib/utils';

/**
 * 시청자 페이지 데모 (#277) — 실제 테마 래퍼(StreamerThemeScope)에 테마를 먹여 시청자 페이지 축소판을 그린다.
 * 위의 색·글꼴 버튼을 누르면 실제 설정 화면과 같은 방식(CSS 변수 덮기 + Google Fonts)으로 바뀐다
 */
const PRIMARY_SWATCHES = ['#3b82f6', '#e11d48', '#16a34a', '#7c3aed', '#f59e0b'];
const BACKGROUNDS: { label: string; value: string | null; scheme: ThemeInput['colorScheme'] }[] = [
  { label: '기본', value: null, scheme: 'SYSTEM' },
  { label: '크림', value: '#fdf6e3', scheme: 'LIGHT' },
  { label: '네이비', value: '#0f172a', scheme: 'DARK' },
];
const FONT_KEYS: ThemeFontKey[] = ['suit', 'jua', 'nanum-pen-script', 'black-han-sans'];

const COMMANDS = [
  { command: '!디스코드', description: '디스코드 초대 링크', permission: '시청자' },
  { command: '!노래 신청 <검색어>', description: '유튜브 노래를 대기열에', permission: '시청자' },
  { command: '!인사', description: '안녕하세요! 오늘도 편하게 놀다 가세요', permission: '시청자' },
  { command: '!제목 <내용>', description: '방송 제목 변경', permission: '매니저' },
];

export function DemoViewerPage() {
  const [theme, setTheme] = useState<ThemeInput>({ primaryColor: '#3b82f6', backgroundColor: null, sidebarColor: null, colorScheme: 'SYSTEM', fontKey: 'suit' });

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 테마 컨트롤 — 설정 › 테마 의 축소판 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">강조색</span>
          {PRIMARY_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`강조색 ${color}`}
              className={cn('size-5 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110', theme.primaryColor === color && 'ring-2 ring-foreground')}
              style={{ background: color }}
              onClick={() => setTheme((t) => ({ ...t, primaryColor: color }))}
            />
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="mr-0.5 text-muted-foreground">배경</span>
          {BACKGROUNDS.map((bg) => (
            <button
              key={bg.label}
              type="button"
              className={cn('rounded-md border px-2 py-0.5 transition-colors', theme.backgroundColor === bg.value ? 'border-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setTheme((t) => ({ ...t, backgroundColor: bg.value, colorScheme: bg.scheme }))}
            >
              {bg.label}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="mr-0.5 text-muted-foreground">글꼴</span>
          {FONT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={cn('rounded-md border px-2 py-0.5 transition-colors', theme.fontKey === key ? 'border-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setTheme((t) => ({ ...t, fontKey: key }))}
            >
              {THEME_FONTS.find((f) => f.key === key)?.label.replace(' (기본)', '')}
            </button>
          ))}
        </span>
      </div>

      {/* 시청자 페이지 축소판 — 사이드바 + 명령어 표 + 지금 재생 중 */}
      <StreamerThemeScope theme={theme} scopeId="landing-demo" className="flex min-h-0 flex-1 transition-colors duration-300">
        <aside className="hidden w-40 shrink-0 flex-col gap-3 border-r bg-sidebar p-3 text-sm sm:flex">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">위</span>
            <div className="flex flex-col leading-tight">
              <span className="font-bold">위즈 WisdomIT</span>
              <span className="text-[11px] text-muted-foreground">위즈봇</span>
            </div>
          </div>
          <nav className="flex flex-col gap-1 text-xs">
            <span className="flex items-center gap-2 rounded-md bg-primary px-2 py-1.5 font-semibold text-primary-foreground"><BotMessageSquare className="size-3.5" /> 명령어</span>
            <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground"><ListMusic className="size-3.5" /> 플레이리스트</span>
            <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground"><History className="size-3.5" /> 재생 기록</span>
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-3">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
            <Music className="size-4 text-primary" />
            <span className="truncate font-semibold">IU - Love wins all</span>
            <span className="truncate text-muted-foreground">· 신청: 고정닉</span>
            <span className="ml-auto shrink-0 rounded bg-primary/15 px-1.5 py-0.5 font-semibold text-primary">재생 중</span>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card text-xs">
            <div className="grid grid-cols-[7rem_1fr_3.5rem] border-b bg-muted/50 px-3 py-1.5 font-semibold text-muted-foreground">
              <span>명령어</span><span>설명</span><span>권한</span>
            </div>
            {COMMANDS.map((c) => (
              <div key={c.command} className="grid grid-cols-[7rem_1fr_3.5rem] items-center border-b px-3 py-1.5 last:border-b-0">
                <span className="truncate rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">{c.command}</span>
                <span className="truncate pl-2 text-foreground/90">{c.description}</span>
                <span className="text-muted-foreground">{c.permission}</span>
              </div>
            ))}
          </div>
        </div>
      </StreamerThemeScope>
    </div>
  );
}
