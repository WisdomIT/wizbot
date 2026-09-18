'use client';

import { AppWindow, Copy, Download, Eye, EyeOff, MonitorSpeaker, Play, RadioTower, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * 송출 소스 (#322) — 앱·OBS 브라우저 소스 중 **연결된 세션 하나**를 골라 소리를 내게 한다.
 * - SourceStatusLine: 플레이어 상단의 한 줄(연결됨/연결 안 됨) + 무응답 경고
 * - SourceSection: 설정 모달 우측 — 앱 내려받기·OBS 주소, 연결된 세션 목록(찾기·설정), 선택 해제
 */

/** 컨트롤러 상태 재조회 주기 — 연결 판정의 여유 시간에도 쓴다 */
const STATE_REFETCH_MS = 10_000;
/** 재생을 눌렀는데 이만큼 지나도 송출 세션의 응답이 없으면 경고 */
const NO_RESPONSE_MS = 12_000;

export const SESSION_LABEL = { OBS: 'OBS 브라우저 소스', ELECTRON: '플레이어 앱' } as const;

export type SourceSession = { sessionId: string; source: 'OBS' | 'ELECTRON'; label: string; active: boolean; lastSeenAgoMs: number };

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
  const sessions = source.sessions.filter((s) => alive(s.lastSeenAgoMs));
  const selected = source.selectedSessionId ? sessions.find((s) => s.sessionId === source.selectedSessionId) ?? null : null;
  return { now, sinceReceived, online: source.online && alive(source.lastSeenAgoMs), sessions, selected };
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
        ) : online && selected ? (
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

/** 설정 모달 우측 — 앱·OBS 링크와 연결된 세션 목록. 순서는 서버가 먼저 연결된 순으로 고정해 준다 */
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
  const { sinceReceived, sessions } = useLiveSessions(source, receivedAt);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-3 rounded-md border px-3 py-2">
        <AppWindow className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">플레이어 앱</span>
          <span className="text-xs text-muted-foreground">설치해 켜두면 아래 목록에 나타납니다.</span>
        </div>
        {/* 앱 안에서 눌러도 setWindowOpenHandler 가 외부 브라우저로 넘긴다 */}
        <Button asChild size="sm" variant="outline">
          <a href="/download" target="_blank" rel="noreferrer">
            <Download /> 내려받기
          </a>
        </Button>
      </div>
      <ObsSourceCard token={source.sourceToken} onRegenerate={onRegenerate} />

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">연결된 플레이어 {sessions.length > 0 && `(${sessions.length})`}</span>
        {sessions.length === 0 ? (
          <p className="rounded-md border px-3 py-4 text-center text-xs text-muted-foreground">연결된 플레이어가 없습니다. 앱을 켜거나 OBS 에 브라우저 소스를 추가하세요.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {sessions.map((session) => (
              <li key={session.sessionId} className="flex items-center gap-3 px-3 py-2">
                {session.source === 'ELECTRON' ? <MonitorSpeaker className="size-4 shrink-0 text-muted-foreground" /> : <RadioTower className="size-4 shrink-0 text-muted-foreground" />}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {session.label}
                    <span className="ml-2 text-xs text-muted-foreground">{SESSION_LABEL[session.source]}</span>
                    {mySessionId === session.sessionId && <span className="ml-2 text-xs text-muted-foreground">(이 앱)</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {session.active ? <span className="text-emerald-600 dark:text-emerald-400">송출 중</span> : '대기'} · 마지막 신호 {Math.round((session.lastSeenAgoMs + sinceReceived) / 1000)}초 전
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="찾기" onClick={() => onLocate(session)}>
                      <Eye />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>찾기</TooltipContent>
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
        <div>
          <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={onClearSelection}>
            송출 소스 선택 해제 (소리 끄기)
          </button>
        </div>
      )}
    </div>
  );
}

/** OBS 브라우저 소스 주소 — 보기/복사/재발급. 설정 다이얼로그에 있던 것을 옮겼다 (#322) */
function ObsSourceCard({ token, onRegenerate }: { token: string | null; onRegenerate: () => void }) {
  // 주소는 방송 화면에 그대로 찍힐 수 있으므로 기본은 가려둔다
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [origin, setOrigin] = useState('');
  useState(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  });
  const playerUrl = token ? `${origin}/obs/${token}/player` : '';

  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
      <RadioTower className="size-5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">OBS 브라우저 소스</span>
        <div className="flex items-center gap-1">
          <Input readOnly value={playerUrl} type={revealed ? 'text' : 'password'} className="h-8 font-mono text-xs" />
          <Button variant="ghost" size="icon" aria-label={revealed ? '주소 가리기' : '주소 보기'} title={revealed ? '주소 가리기' : '주소 보기'} onClick={() => setRevealed((prev) => !prev)}>
            {revealed ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="주소 복사"
            title="주소 복사"
            onClick={() => {
              void navigator.clipboard.writeText(playerUrl);
              toast.success('주소를 복사했습니다.');
            }}
          >
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" aria-label="주소 재발급" title="주소 재발급" onClick={() => setConfirming(true)}>
            <RefreshCw />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">이 주소를 OBS 브라우저 소스로 추가하세요. 아는 사람은 재생 상태를 볼 수 있으니 방송에 노출됐다면 재발급.</span>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>주소를 새로 발급할까요?</DialogTitle>
            <DialogDescription>
              새 주소가 발급되면 <strong>기존 주소는 즉시 사용할 수 없게 됩니다.</strong> 이미 OBS 에 등록해 둔 브라우저 소스는 재생이 멈추므로, 새 주소를 다시 붙여넣어야 합니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                setRevealed(false);
                onRegenerate();
              }}
            >
              새로 발급
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

