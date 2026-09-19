'use client';

import { Download, Eye, MonitorSpeaker, Play, Plus, RadioTower, Settings2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ObsSourceUrlField } from './obs-source-url-field';

/**
 * 송출 소스 (#322) — 앱·OBS 브라우저 소스 중 **연결된 세션 하나**를 골라 소리를 내게 한다.
 * - SourceStatusLine: 플레이어 상단의 한 줄(연결됨/연결 안 됨) + 무응답 경고
 * - SourceSection: 설정 모달 우측 — 세션 목록(찾기·설정) + 「플레이어 추가」 드롭다운(앱 내려받기 / OBS 주소 모달), 선택 해제
 */

/** 컨트롤러 상태 재조회 주기 — 연결 판정의 여유 시간에도 쓴다 */
const STATE_REFETCH_MS = 10_000;
/** 재생을 눌렀는데 이만큼 지나도 송출 세션의 응답이 없으면 경고 */
const NO_RESPONSE_MS = 12_000;

export const SESSION_LABEL = { OBS: 'OBS 브라우저 소스', ELECTRON: '플레이어 앱' } as const;

export type SourceSession = { sessionId: string; source: 'OBS' | 'ELECTRON'; label: string; active: boolean; connected: boolean; lastSeenAgoMs: number };

export interface SourceStatus {
  selectedSessionId: string | null;
  sourceType: 'NONE' | 'OBS' | 'ELECTRON';
  sourceLabel: string | null;
  online: boolean;
  lastSeenAgoMs: number | null;
  sessions: SourceSession[];
  timeoutMs: number;
  sourceToken: string | null;
}

/** 1초마다 현재 시각 — 연결 판정을 하트비트 사이에서도 이어 센다 */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * 연결 판정: 예전엔 서버의 lastSeenAt 을 **이 PC 시계**로 빼서 시계 오차만큼 틀렸고, 조회 직전 값(최대 5초 묵음)에 재조회 대기 10초가 더해져
 * 타임아웃 15초 경계에 걸리면 「연결됨 ↔ 연결 안 됨」이 깜빡였다 (#319). 지금은 서버가 준 「몇 ms 전」에 응답 수신 후 경과 시간을 더해 세고,
 * 여유는 타임아웃 + 재조회 주기 — 하트비트가 정말 끊기면 늦어도 25초 안에 「연결 안 됨」이 된다.
 */
function useLiveSessions(source: SourceStatus, receivedAt: number) {
  const now = useNow();
  const sinceReceived = Math.max(0, now - receivedAt);
  const alive = (agoMs: number | null) => agoMs !== null && agoMs + sinceReceived <= source.timeoutMs + STATE_REFETCH_MS;
  //  서버는 끊긴 세션도 1시간 남겨 준다 — 여기서는 연결 여부만 이 시각 기준으로 다시 센다
  const sessions = source.sessions.map((s) => ({ ...s, connected: alive(s.lastSeenAgoMs), agoMs: s.lastSeenAgoMs + sinceReceived }));
  const selected = source.selectedSessionId ? sessions.find((s) => s.sessionId === source.selectedSessionId) ?? null : null;
  return { now, sinceReceived, online: source.online && alive(source.lastSeenAgoMs), sessions, selected };
}

/** 「12초 전」 「3분 전」 「1시간 전」 */
function formatAgo(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  return `${Math.floor(m / 60)}시간 전`;
}

/** 플레이어 상단 한 줄 — 선택한 플레이어의 연결 상태와 무응답 경고 */
export function SourceStatusLine({
  source,
  playback,
  receivedAt,
}: {
  source: SourceStatus;
  playback: { status: 'PLAYING' | 'PAUSED' | 'STOPPED'; playRequestedAt: string | Date | null; sourceAckAt: string | Date | null };
  /** getState 응답을 받은 시각 (react-query dataUpdatedAt) */
  receivedAt: number;
}) {
  const { now, online, selected } = useLiveSessions(source, receivedAt);

  //  재생을 눌렀는데 고른 세션이 켜져 있으면서도 응답(재생 시작·진행률)이 없다
  const requestedAt = playback.playRequestedAt ? new Date(playback.playRequestedAt).getTime() : null;
  const ackedAt = playback.sourceAckAt ? new Date(playback.sourceAckAt).getTime() : null;
  const unresponsive =
    playback.status === 'PLAYING' && online && requestedAt !== null && (ackedAt === null || ackedAt < requestedAt) && now - requestedAt > NO_RESPONSE_MS;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {source.selectedSessionId === null ? (
          <>
            <Badge variant="outline">송출 소스 없음</Badge>
            앱이나 OBS 브라우저 소스를 켜면 처음 연결된 것이 자동으로 선택됩니다. 설정에서 바꿀 수 있습니다.
          </>
        ) : online && selected?.connected ? (
          <>
            <Badge>연결됨</Badge>
            {SESSION_LABEL[selected.source]} · {selected.label} 에서 재생 중입니다.
          </>
        ) : (
          <>
            <Badge variant="destructive">연결 안 됨</Badge>
            선택한 {source.sourceType === 'NONE' ? '송출 소스' : SESSION_LABEL[source.sourceType]}
            {source.sourceLabel ? ` · ${source.sourceLabel}` : ''} 이(가) 켜져 있지 않습니다. 재생해도 소리가 나지 않습니다.
          </>
        )}
      </div>
      {unresponsive && selected && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2">
          송출 소스({SESSION_LABEL[selected.source]} · {selected.label})가 재생에 응답하지 않습니다. 설정의 「찾기」로 그 창을 확인하거나 앱·브라우저 소스를 다시 켜보세요.
        </div>
      )}
    </div>
  );
}

/** 설정 모달 우측 — 세션 목록이 주인공. 앱·OBS 안내는 「플레이어 추가」 드롭다운 뒤로 (목록과 비슷한 카드가 위에 또 있으면 헷갈린다) */
export function SourceSection({
  source,
  receivedAt,
  mySessionId,
  onSelect,
  onLocate,
  onClearSelection,
  onRegenerate,
}: {
  source: SourceStatus;
  receivedAt: number;
  /** 앱 안이면 이 앱의 세션 ID — 목록에서 「이 앱」으로 표시 */
  mySessionId: string | null;
  onSelect: (session: SourceSession) => void;
  onLocate: (session: SourceSession) => void;
  onClearSelection: () => void;
  onRegenerate: () => void;
}) {
  const { sessions } = useLiveSessions(source, receivedAt);

  const [obsOpen, setObsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">플레이어 {sessions.length > 0 && `(${sessions.filter((s) => s.connected).length}/${sessions.length} 연결)`}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus /> 플레이어 추가
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* 앱 안에서 눌러도 setWindowOpenHandler 가 외부 브라우저로 넘긴다 */}
              <DropdownMenuItem asChild>
                <a href="/download" target="_blank" rel="noreferrer">
                  <Download /> 플레이어 앱 내려받기
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setObsOpen(true)}>
                <Settings2 /> OBS 브라우저 소스 설정…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ObsSourceDialog open={obsOpen} onOpenChange={setObsOpen} token={source.sourceToken} onRegenerate={onRegenerate} />
        {sessions.length === 0 ? (
          <p className="rounded-md border px-3 py-4 text-center text-xs text-muted-foreground">연결된 플레이어가 없습니다. 앱을 켜거나 OBS 에 브라우저 소스를 추가하세요.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {sessions.map((session) => (
              <li key={session.sessionId} className={`flex items-center gap-3 px-3 py-2 ${session.connected ? '' : 'bg-muted/40'}`}>
                {session.source === 'ELECTRON' ? <MonitorSpeaker className={`size-4 shrink-0 ${session.connected ? 'text-muted-foreground' : 'text-destructive/60'}`} /> : <RadioTower className={`size-4 shrink-0 ${session.connected ? 'text-muted-foreground' : 'text-destructive/60'}`} />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate ${session.connected ? '' : 'text-muted-foreground'}`}>
                    {session.label}
                    <span className="ml-2 text-xs text-muted-foreground">{SESSION_LABEL[session.source]}</span>
                    {mySessionId === session.sessionId && <span className="ml-2 text-xs text-muted-foreground">(이 앱)</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {/* 끊긴 세션은 1시간 동안 남는다 — 「신호 없음」을 강조해 꺼진 것을 알아보게 */}
                    {session.connected ? (
                      <>
                        {session.active ? <span className="text-emerald-600 dark:text-emerald-400">송출 중</span> : '대기'} · 마지막 신호 {formatAgo(session.agoMs)}
                      </>
                    ) : (
                      <span className="font-medium text-destructive">신호 없음 · 마지막 신호 {formatAgo(session.agoMs)}{session.active ? ' · 송출 소스로 선택됨' : ''}</span>
                    )}
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="찾기" disabled={!session.connected} onClick={() => onLocate(session)}>
                      <Eye />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{session.connected ? '찾기' : '연결돼 있지 않아 찾기 신호를 받을 수 없습니다'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant={session.active ? 'default' : 'outline'} size="icon" aria-label="송출 소스로 설정" disabled={session.active} onClick={() => onSelect(session)}>
                      <Play />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{session.active ? '지금 송출 소스입니다' : session.source === 'ELECTRON' ? '이 앱을 송출 소스로 설정' : '이 브라우저 소스를 송출 소스로 설정'}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>

      {source.selectedSessionId !== null && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="text-destructive" onClick={onClearSelection}>
            <VolumeX /> 송출 소스 선택 해제
          </Button>
        </div>
      )}
    </div>
  );
}

/** OBS 브라우저 소스 주소 — 보기/복사/재발급. 「플레이어 추가 → OBS 브라우저 소스 설정…」 으로 여는 작은 모달 */
function ObsSourceDialog({ open, onOpenChange, token, onRegenerate }: { open: boolean; onOpenChange: (open: boolean) => void; token: string | null; onRegenerate: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>OBS 브라우저 소스</DialogTitle>
          <DialogDescription>
            이 주소를 OBS 에 브라우저 소스로 추가하면 목록에 「OBS 브라우저 소스」로 나타납니다. 주소를 아는 사람은 재생 상태를 볼 수 있으니 방송에 노출됐다면 재발급하세요.
          </DialogDescription>
        </DialogHeader>
        <ObsSourceUrlField token={token} onRegenerate={onRegenerate} />
        <p className="text-xs text-muted-foreground">
          💡 유튜브 프리미엄 계정이 있다면, OBS 에서 브라우저 소스를 하나 더 만들어 주소를 <code className="font-mono">https://www.youtube.com</code> 으로 두고 [상호작용] 창에서 로그인해두면 광고 없이 재생됩니다.
        </p>
        <p className="text-xs text-muted-foreground">⚠️ 한 OBS 안에 이 주소를 둘 이상 넣지 마세요 — 재시작 때 두 소스의 ID 가 서로 바뀔 수 있습니다.</p>
      </DialogContent>
    </Dialog>
  );
}
