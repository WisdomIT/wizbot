'use client';

import type { UsageToken } from '@wizbot/shared/chatbot/definitions';
import { THEME_FONTS, type ThemeFontKey, type ThemeInput } from '@wizbot/shared/lib/theme';
import { ArrowUpDown, BookOpen, ChevronLeft, ChevronRight, FileAudio2, Headphones, Info, Megaphone, SquareChevronRight } from 'lucide-react';
import { type JSX, useState } from 'react';

import BodyBreadcrumb from '@/components/body-breadcrumb';
import { UsageTokens } from '@/components/custom/usage-tokens';
import { SearchInput } from '@/components/data-table/search-input';
import { NavLogin } from '@/components/nav-login';
import { NavTitle } from '@/components/nav-title';
import { PlayerBar } from '@/components/song/player-bar';
import { formatTime, type PlaybackView, SongPlayer, usePlayerPosition } from '@/components/song/song-player';
import { StreamerThemeScope } from '@/components/theme/streamer-theme-scope';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * 시청자 페이지 데모 (#277) — 실제 시청자 페이지와 **같은 컴포넌트**로 그린다.
 * 사이드바는 shadcn Sidebar 프리미티브 + NavTitle·NavLogin(실제), 메뉴는 NavMenu·NavSecondary 와 같은 마크업(링크 대신 버튼 — 이동하지 않고 탭을 바꾼다).
 * 본문은 BodyBreadcrumb(실제) 안에 명령어 표(DataTable 과 같은 마크업 — URL 쿼리를 건드리는 useSearchState 만 뺐다)·플레이리스트(PlaylistView 와 같은 마크업, SongPlayer 실제)·
 * 재생 기록(HistoryView 와 같은 마크업). 하단 재생 바는 실제 PlayerBar — 플레이리스트 페이지에서는 숨는다(실제와 같다).
 * 실제 Sidebar 는 fixed·h-svh 라 프레임 안에 넣을 수 없어 inset 변형의 마크업(peer/data-variant)만 같은 클래스로 재현한다
 */
const PRIMARY_SWATCHES = ['#3b82f6', '#e11d48', '#16a34a', '#7c3aed', '#f59e0b'];
const BACKGROUNDS: { label: string; value: string | null; scheme: ThemeInput['colorScheme'] }[] = [
  { label: '기본', value: null, scheme: 'SYSTEM' },
  { label: '크림', value: '#fdf6e3', scheme: 'LIGHT' },
  { label: '네이비', value: '#0f172a', scheme: 'DARK' },
];
const FONT_KEYS: ThemeFontKey[] = ['suit', 'jua', 'nanum-pen-script', 'black-han-sans'];

type Tab = 'command' | 'playlist' | 'history';
const CHANNEL = { title: '위즈 WisdomIT', description: '위즈봇', avatar: '/wisdomit.png' };
const MENU: { group: string; items: { key: Tab; name: string; icon: JSX.Element }[] }[] = [
  { group: '봇', items: [{ key: 'command', name: '명령어', icon: <SquareChevronRight /> }] },
  { group: '노래', items: [{ key: 'playlist', name: '플레이리스트', icon: <Headphones /> }, { key: 'history', name: '재생 기록', icon: <FileAudio2 /> }] },
];
const SECONDARY = [
  { name: '공지사항', icon: <Megaphone /> },
  { name: '이용 안내', icon: <BookOpen /> },
  { name: '사이트 정보', icon: <Info /> },
];

type Command = { command: string; usageTokens: UsageToken[]; description: string; permission: string };
const COMMANDS: Command[] = [
  { command: '!디스코드', usageTokens: [{ text: '!디스코드' }], description: '디스코드 초대 링크', permission: '시청자' },
  { command: '!인사', usageTokens: [{ text: '!인사' }], description: '안녕하세요! 오늘도 편하게 놀다 가세요', permission: '시청자' },
  { command: '!노래', usageTokens: [{ text: '!노래' }], description: '지금 재생 중인 곡', permission: '시청자' },
  { command: '!노래 신청', usageTokens: [{ text: '!노래 신청' }, { arg: '검색어 또는 URL' }], description: '유튜브 노래를 대기열에 신청', permission: '시청자' },
  { command: '!노래 삭제', usageTokens: [{ text: '!노래 삭제' }], description: '내가 신청한 곡을 대기열에서 삭제', permission: '시청자' },
  { command: '!제목', usageTokens: [{ text: '!제목' }, { arg: '내용' }], description: '방송 제목 변경', permission: '매니저' },
  { command: '!카테고리', usageTokens: [{ text: '!카테고리' }, { arg: '이름' }], description: '방송 카테고리 변경', permission: '매니저' },
];
const NOW: PlaybackView = { status: 'PLAYING', youtubeId: null, title: 'IU - Love wins all', videoUploader: '1theK (원더케이)', requester: '고정닉', durationSeconds: 245, positionSeconds: 92 };
const QUEUE = [
  { id: 1, title: 'NewJeans - Hype Boy', videoUploader: 'HYBE LABELS', requester: '밤샘코딩', durationSeconds: 179 },
  { id: 2, title: 'aespa - Supernova', videoUploader: 'SMTOWN', requester: '치즈조각', durationSeconds: 178 },
  { id: 3, title: '데이식스 - 한 페이지가 될 수 있게', videoUploader: 'JYP Entertainment', requester: '자동 재생', durationSeconds: 228 },
];
type Status = 'PLAYED' | 'SKIPPED' | 'CANCELED' | 'FAILED';
const STATUS_LABEL: Record<Status, string> = { PLAYED: '재생됨', SKIPPED: '넘김', CANCELED: '취소됨', FAILED: '재생 실패' };
const STATUS_VARIANT: Record<Status, 'default' | 'secondary' | 'outline' | 'destructive'> = { PLAYED: 'default', SKIPPED: 'secondary', CANCELED: 'outline', FAILED: 'destructive' };
const HISTORY: { at: string; title: string; videoUploader: string; requester: string; status: Status }[] = [
  { at: '09/19 20:12', title: 'QWER - 고민중독', videoUploader: 'QWER Official', requester: '지나가던냥', status: 'PLAYED' },
  { at: '09/19 20:05', title: '(여자)아이들 - 나는 아픈 건 딱 질색이니까', videoUploader: '(G)I-DLE (여자)아이들 (Official YouTube Channel)', requester: '구독각', status: 'SKIPPED' },
  { at: '09/19 19:58', title: 'DAY6 - Welcome to the Show', videoUploader: 'JYP Entertainment', requester: '자동 재생', status: 'PLAYED' },
  { at: '09/19 19:40', title: 'LE SSERAFIM - CRAZY', videoUploader: 'HYBE LABELS', requester: '치즈조각', status: 'CANCELED' },
];

export function DemoViewerPage() {
  const [theme, setTheme] = useState<ThemeInput>({ primaryColor: '#3b82f6', backgroundColor: null, sidebarColor: null, colorScheme: 'SYSTEM', fontKey: 'suit' });
  const [tab, setTab] = useState<Tab>('command');
  const [playing, setPlaying] = useState(true);
  const playback: PlaybackView = { ...NOW, status: playing ? 'PLAYING' : 'PAUSED' };
  const current = MENU.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group }))).find((i) => i.key === tab)!;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 테마 컨트롤 — 설정 › 테마 의 축소판 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">강조색</span>
          {PRIMARY_SWATCHES.map((color) => (
            <button key={color} type="button" aria-label={`강조색 ${color}`} className={cn('size-5 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110', theme.primaryColor === color && 'ring-2 ring-foreground')} style={{ background: color }} onClick={() => setTheme((t) => ({ ...t, primaryColor: color }))} />
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="mr-0.5 text-muted-foreground">배경</span>
          {BACKGROUNDS.map((bg) => (
            <button key={bg.label} type="button" className={cn('rounded-md border px-2 py-0.5 transition-colors', theme.backgroundColor === bg.value ? 'border-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')} onClick={() => setTheme((t) => ({ ...t, backgroundColor: bg.value, colorScheme: bg.scheme }))}>{bg.label}</button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="mr-0.5 text-muted-foreground">글꼴</span>
          {FONT_KEYS.map((key) => (
            <button key={key} type="button" className={cn('rounded-md border px-2 py-0.5 transition-colors', theme.fontKey === key ? 'border-foreground font-semibold' : 'text-muted-foreground hover:text-foreground')} onClick={() => setTheme((t) => ({ ...t, fontKey: key }))}>{THEME_FONTS.find((f) => f.key === key)?.label.replace(' (기본)', '')}</button>
          ))}
        </span>
      </div>

      {/* 시청자 페이지 — 실제 레이아웃(inset 사이드바) */}
      <StreamerThemeScope theme={theme} scopeId="landing-demo" className="min-h-0 flex-1 transition-colors duration-300">
        <SidebarProvider className="h-full min-h-0 bg-sidebar">
          <DemoSidebar tab={tab} onTab={setTab} />
          <SidebarInset className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
            <BodyBreadcrumb group={current.group} page={current.name}>
              {tab === 'command' && <CommandTable />}
              {tab === 'playlist' && <Playlist playback={playback} />}
              {tab === 'history' && <HistoryTable />}
            </BodyBreadcrumb>
            {/* 실제 시청자 하단 재생 바 — 플레이리스트 페이지에서는 자체 플레이어가 있어 숨는다 */}
            {tab !== 'playlist' && (
              <PlayerBar playback={playback} href="#showcase-panel-viewer-page" controls={{ onPlay: () => setPlaying(true), onPause: () => setPlaying(false), onNext: () => undefined }} />
            )}
          </SidebarInset>
        </SidebarProvider>
      </StreamerThemeScope>
    </div>
  );
}

/** 실제 Sidebar(inset) 의 데스크톱 마크업을 프레임 안에 — fixed 대신 흐름 배치. SidebarTrigger 로 접히는 것도 따라간다 */
function DemoSidebar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  const { state } = useSidebar();
  return (
    <div className={cn('group peer hidden text-sidebar-foreground md:block', state === 'collapsed' && 'md:hidden')} data-state={state} data-collapsible={state === 'collapsed' ? 'offcanvas' : ''} data-variant="inset" data-side="left" data-slot="sidebar">
      <div data-slot="sidebar-container" className="flex h-full w-(--sidebar-width) flex-col p-2">
        <div data-sidebar="sidebar" data-slot="sidebar-inner" className="bg-sidebar flex h-full w-full flex-col">
          <SidebarHeader>
            <NavTitle data={{ ...CHANNEL, href: '#showcase-panel-viewer-page' }} />
          </SidebarHeader>
          <SidebarContent>
            {MENU.map((group) => (
              <SidebarGroup key={group.group} className="group-data-[collapsible=icon]:hidden">
                <SidebarGroupLabel>{group.group}</SidebarGroupLabel>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton asChild isActive={tab === item.key}>
                        <button type="button" onClick={() => onTab(item.key)}>
                          {item.icon}
                          <span>{item.name}</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroup>
            ))}
            <SidebarGroup className="mt-auto">
              <SidebarGroupContent>
                <SidebarMenu>
                  {SECONDARY.map((item) => (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton asChild size="sm">
                        <button type="button" tabIndex={-1}>
                          {item.icon}
                          <span>{item.name}</span>
                        </button>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <NavLogin />
          </SidebarFooter>
        </div>
      </div>
    </div>
  );
}

/** 시청자 명령어 표 — components/data-table/data-table.tsx 와 같은 마크업 (검색·정렬 헤더·페이지 표시), 데이터만 로컬 */
function CommandTable() {
  const [q, setQ] = useState('');
  const rows = COMMANDS.filter((c) => c.command.includes(q));
  return (
    <div>
      <div className="flex items-center justify-between gap-2 py-4">
        <SearchInput placeholder="명령어 검색" value={q} onChange={setQ} className="max-w-sm" />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead><span className="inline-flex items-center gap-1">명령어 <ArrowUpDown className="size-3.5 text-muted-foreground" /></span></TableHead>
              <TableHead>사용법</TableHead>
              <TableHead>설명</TableHead>
              <TableHead><span className="inline-flex items-center gap-1">권한 <ArrowUpDown className="size-3.5 text-muted-foreground" /></span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? rows.map((c) => (
              <TableRow key={c.command}>
                <TableCell><span className="text-sm">{c.command}</span></TableCell>
                <TableCell><UsageTokens tokens={c.usageTokens} /></TableCell>
                <TableCell><span className="text-sm">{c.description}</span></TableCell>
                <TableCell><span className="text-sm">{c.permission}</span></TableCell>
              </TableRow>
            )) : (
              <TableRow><TableCell colSpan={4} className="h-24 text-center">등록된 명령어가 없습니다</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">{rows.length}개 명령어 / 1페이지 중 1페이지</div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" disabled><ChevronLeft className="h-4 w-4" />이전</Button>
          <Button variant="outline" size="sm" disabled>다음<ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

/** 플레이리스트 — playlist-view.tsx 와 같은 마크업. SongPlayer 는 실제(읽기 전용) */
function Playlist({ playback }: { playback: PlaybackView }) {
  const position = usePlayerPosition(playback.positionSeconds, playback.durationSeconds, playback.status === 'PLAYING');
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <SongPlayer playback={playback} position={position} />
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>대기열 ({QUEUE.length})</CardTitle>
              <CardDescription>최대 30곡 · 10:00 이하의 영상만 신청 가능 · 1인 1곡</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="w-28">신청자</TableHead>
                    <TableHead className="w-16 text-right">길이</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {QUEUE.map((song, index) => (
                    <TableRow key={song.id}>
                      <TableCell className="tabular-nums">{index + 1}</TableCell>
                      <TableCell className="break-words whitespace-normal">
                        <div className="flex flex-col">
                          <span>{song.title}</span>
                          <span className="text-xs text-muted-foreground">{song.videoUploader}</span>
                        </div>
                      </TableCell>
                      <TableCell className="break-words whitespace-normal">{song.requester}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatTime(song.durationSeconds)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>신청 방법</CardTitle>
              <CardDescription>방송 채팅에 아래 명령어를 입력하세요.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <code className="w-fit rounded bg-primary px-2 py-1 font-mono text-sm text-primary-foreground">!노래 신청 [검색어 또는 URL]</code>
                <span className="text-sm text-muted-foreground">유튜브 노래를 대기열에 신청</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** 재생 기록 — history-view.tsx 와 같은 마크업 */
function HistoryTable() {
  return (
    <div className="flex max-w-3xl flex-col gap-4 py-4">
      <Card>
        <CardHeader>
          <CardTitle>재생 기록</CardTitle>
          <CardDescription>지금까지 신청된 곡입니다. 최신순으로 보여줍니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">시각</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-28">신청자</TableHead>
                <TableHead className="w-24">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {HISTORY.map((entry) => (
                <TableRow key={entry.title}>
                  <TableCell className="text-xs text-muted-foreground">{entry.at}</TableCell>
                  <TableCell className="break-words whitespace-normal">
                    <div className="flex flex-col">
                      <span>{entry.title}</span>
                      <span className="text-xs text-muted-foreground">{entry.videoUploader}</span>
                    </div>
                  </TableCell>
                  <TableCell className="break-words whitespace-normal">{entry.requester}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[entry.status]}>{STATUS_LABEL[entry.status]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
