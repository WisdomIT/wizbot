'use client';

import { LogOut, Settings } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { toast } from 'sonner';

import { Youtube } from '@/components/custom/brand-icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

import { ShortcutInput } from './shortcut-input';
import { SourceSection, type SourceSession, type SourceStatus } from './source-section';

export interface SongSettings {
  /** 노래 신청 기능 사용 여부 (#237) — 끄면 신청·관련 채팅 명령어가 모두 꺼졌다고 응답한다 */
  active: boolean;
  /** 신청 제한 (#237) — maxPerRequester null 은 무제한. maxDurationSeconds = 신청 가능한 최대 길이 (#326) */
  requestPolicy: { maxPerRequester: number | null; maxQueueLength: number; maxDurationSeconds: number };
  overlay: { mode: 'ALWAYS' | 'TIMED'; durationSeconds: number };
  autoPlay: boolean;
  historyPublic: boolean;
  keyboardShortcut: boolean;
  shortcuts: { playPause: string; stop: string; next: string };
}

/** 데스크톱 앱이 등록하는 전역 단축키 (#85) */
const SHORTCUT_ACTIONS = [
  { key: 'playPause', label: '재생 / 일시정지' },
  { key: 'stop', label: '정지' },
  { key: 'next', label: '다음 곡' },
] as const;

/** 노래 기능 설정 — 흩어져 있던 설정을 한 곳에 모은다 (#97) */
export function SettingsDialog({
  source,
  settings,
  onChangeActive,
  onChangeRequestPolicy,
  onChangeOverlay,
  onChangeAutoPlay,
  onChangeHistoryPublic,
  onChangeKeyboardShortcut,
  onChangeShortcuts,
  autoLaunch,
  youtube,
  isApp = false,
}: {
  /** 송출 소스 (#322) — 모달 우측. 링크·연결된 세션 목록(찾기·설정) */
  source: {
    status: SourceStatus;
    receivedAt: number;
    mySessionId: string | null;
    onSelect: (session: SourceSession) => void;
    onLocate: (session: SourceSession) => void;
    onClearSelection: () => void;
    onRegenerate: () => void;
  };
  settings: SongSettings;
  onChangeActive: (active: boolean) => void;
  onChangeRequestPolicy: (policy: SongSettings['requestPolicy']) => void;
  onChangeOverlay: (overlay: SongSettings['overlay']) => void;
  onChangeAutoPlay: (enabled: boolean) => void;
  onChangeHistoryPublic: (isPublic: boolean) => void;
  onChangeKeyboardShortcut: (enabled: boolean) => void;
  onChangeShortcuts: (shortcuts: SongSettings['shortcuts']) => void;
  /** 데스크톱 앱에서 열었을 때만 — 계정이 아니라 이 기기의 설정이다 */
  autoLaunch?: { enabled: boolean; onChange: (enabled: boolean) => void };
  /** 데스크톱 앱에서만 — 유튜브 로그인은 앱이 띄우는 별도 창에서 한다 */
  youtube?: { loggedIn: boolean; login: () => void; logout: () => void };
  /** 전역 단축키·화면 테마·로그아웃은 앱 전용 설정이라 앱에서만 보인다 (#202) */
  isApp?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="설정" title="설정">
          <Settings />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>노래 설정</DialogTitle>
          <DialogDescription>
            왼쪽은 노래 기능 설정, 오른쪽은 소리를 내는 송출 소스(앱·OBS 브라우저 소스)입니다.
          </DialogDescription>
        </DialogHeader>

        {/* 가로 2분할 — 좁은 화면에서는 세로로 쌓인다 */}
        <div className="grid gap-6 md:grid-cols-2 md:divide-x">
        <div className="flex flex-col gap-6 md:pr-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <Label htmlFor="setting-active">노래 신청 기능</Label>
              <span className="text-xs text-muted-foreground">
                끄면 신청을 받지 않고, 노래 관련 채팅 명령어에도 꺼져 있다고 응답합니다.
              </span>
            </div>
            <Switch
              id="setting-active"
              checked={settings.active}
              onCheckedChange={onChangeActive}
            />
          </div>
          <Separator />
          <OverlaySection overlay={settings.overlay} onChange={onChangeOverlay} />
          <Separator />
          <RequestPolicySection policy={settings.requestPolicy} onSave={onChangeRequestPolicy} />
          <Separator />

          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <Label htmlFor="setting-autoplay">자동 재생</Label>
                <span className="text-xs text-muted-foreground">
                  대기열이 비면 대표 즐겨찾기에서 한 곡을 골라 이어서 재생합니다.
                </span>
              </div>
              <Switch
                id="setting-autoplay"
                checked={settings.autoPlay}
                onCheckedChange={onChangeAutoPlay}
              />
            </div>

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col">
                <Label htmlFor="setting-history">재생 기록 공개</Label>
                <span className="text-xs text-muted-foreground">
                  시청자용 재생 기록 페이지에 목록을 공개합니다. 개별 곡은 따로 숨길 수 있습니다.
                </span>
              </div>
              <Switch
                id="setting-history"
                checked={settings.historyPublic}
                onCheckedChange={onChangeHistoryPublic}
              />
            </div>
          </div>

          {youtube && (
            <>
              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <Label>유튜브 로그인</Label>
                  <span className="text-xs text-muted-foreground">
                    {youtube.loggedIn
                      ? '로그인되어 있습니다. 프리미엄 계정이면 광고 없이 재생됩니다.'
                      : '프리미엄 계정으로 로그인하면 광고 없이 재생됩니다. 별도 창이 열립니다.'}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" onClick={youtube.login}>
                    <Youtube /> {youtube.loggedIn ? '유튜브 열기' : '로그인'}
                  </Button>
                  {youtube.loggedIn && (
                    <Button variant="ghost" className="text-destructive" onClick={youtube.logout}>
                      로그아웃
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {autoLaunch && (
            <>
              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <Label htmlFor="setting-autolaunch">컴퓨터 시작 시 자동 실행</Label>
                  <span className="text-xs text-muted-foreground">
                    부팅할 때 창 없이 트레이에만 올라옵니다. 이 컴퓨터에만 적용됩니다.
                  </span>
                </div>
                <Switch
                  id="setting-autolaunch"
                  checked={autoLaunch.enabled}
                  onCheckedChange={autoLaunch.onChange}
                />
              </div>
            </>
          )}

          {/* 앱 전용 — 전역 단축키·화면 테마·로그아웃은 웹 콘솔에서 의미가 없거나(단축키·테마는 앱 창 것) 사이드바에 이미 있다(로그아웃) */}
          {isApp && (
            <>
            <Separator />

            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <Label htmlFor="setting-shortcut">전역 단축키</Label>
                  <span className="text-xs text-muted-foreground">
                    위즈봇 플레이어 앱을 설치했다면, 창을 열지 않고도 다른 프로그램을 쓰는 중에
                    조작할 수 있습니다.
                  </span>
                </div>
                <Switch
                  id="setting-shortcut"
                  checked={settings.keyboardShortcut}
                  onCheckedChange={onChangeKeyboardShortcut}
                />
              </div>

              {settings.keyboardShortcut && (
                <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
                  {SHORTCUT_ACTIONS.map((action) => (
                    <div key={action.key} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{action.label}</span>
                      <ShortcutInput
                        value={settings.shortcuts[action.key]}
                        onChange={(accelerator) =>
                          onChangeShortcuts({ ...settings.shortcuts, [action.key]: accelerator })
                        }
                      />
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    버튼을 누른 뒤 원하는 조합을 입력하세요. ⌘/Ctrl · Alt · Shift 중 하나 이상을
                    포함해야 합니다.
                  </p>
                </div>
              )}
            </div>

            <Separator />

            <ThemeSection />

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div className="flex flex-col">
                <Label>로그아웃</Label>
                <span className="text-xs text-muted-foreground">
                  앱에서 로그아웃합니다.
                </span>
              </div>
              <Button variant="outline" onClick={() => (location.href = '/login/logout')}>
                <LogOut /> 로그아웃
              </Button>
            </div>

            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Label>송출 소스</Label>
          <SourceSection
            source={source.status}
            receivedAt={source.receivedAt}
            mySessionId={source.mySessionId}
            onSelect={source.onSelect}
            onLocate={source.onLocate}
            onClearSelection={source.onClearSelection}
            onRegenerate={source.onRegenerate}
          />
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <Label>화면 테마</Label>
        <span className="text-xs text-muted-foreground">
          「시스템」 은 운영체제 설정을 따라갑니다.
        </span>
      </div>
      <Select value={theme ?? 'system'} onValueChange={setTheme}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="system">시스템</SelectItem>
          <SelectItem value="light">라이트</SelectItem>
          <SelectItem value="dark">다크</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function OverlaySection({
  overlay,
  onChange,
}: {
  overlay: SongSettings['overlay'];
  onChange: (overlay: SongSettings['overlay']) => void;
}) {
  const [seconds, setSeconds] = useState(String(overlay.durationSeconds));

  return (
    <div className="flex flex-col gap-2">
      <Label>자막</Label>
      <span className="text-xs text-muted-foreground">
        송출 화면에 현재 곡 제목이 표시됩니다. 글자 크기는 브라우저 소스 높이에 맞춰 조절되고(최대
        120px), 제목이 길면 옆으로 흐릅니다.
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={overlay.mode}
          onValueChange={(mode) =>
            onChange({ mode: mode as 'ALWAYS' | 'TIMED', durationSeconds: overlay.durationSeconds })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALWAYS">항상 표시</SelectItem>
            <SelectItem value="TIMED">곡이 바뀔 때만 잠시 표시</SelectItem>
          </SelectContent>
        </Select>

        {overlay.mode === 'TIMED' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={60}
              value={seconds}
              className="w-20"
              onChange={(event) => setSeconds(event.target.value)}
              onBlur={() => {
                const durationSeconds = Number(seconds);
                if (
                  !Number.isFinite(durationSeconds) ||
                  durationSeconds < 1 ||
                  durationSeconds > 60
                ) {
                  setSeconds(String(overlay.durationSeconds));
                  return;
                }
                if (durationSeconds !== overlay.durationSeconds) {
                  onChange({ mode: overlay.mode, durationSeconds });
                }
              }}
            />
            <span className="text-sm text-muted-foreground">초 동안 표시</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 신청 제한 (#237) — 시청자 채팅 신청에만 적용. 숫자 입력이라 저장 버튼으로 커밋한다 */
function RequestPolicySection({
  policy,
  onSave,
}: {
  policy: SongSettings['requestPolicy'];
  onSave: (policy: SongSettings['requestPolicy']) => void;
}) {
  const toForm = (value: SongSettings['requestPolicy']) => ({
    unlimited: value.maxPerRequester === null,
    perRequester: String(value.maxPerRequester ?? 1),
    maxQueue: String(value.maxQueueLength),
    maxMinutes: String(Math.round(value.maxDurationSeconds / 60)),
  });
  const [form, setForm] = useState(toForm(policy));
  //  서버 값이 바뀌면 폼을 갈아끼운다 — 렌더 중 보정 (#200 패턴)
  const [prevPolicy, setPrevPolicy] = useState(policy);
  if (policy !== prevPolicy) {
    setPrevPolicy(policy);
    setForm(toForm(policy));
  }

  const clamp = (value: string, min: number, max: number, fallback: number) => {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <Label>신청 제한</Label>
        <p className="text-xs text-muted-foreground">
          시청자 채팅 신청에만 적용됩니다 — 직접 추가·즐겨찾기 재생에는 제한이 없습니다.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="setting-queue-max" className="text-xs text-muted-foreground">
            대기열 최대 곡 수 (1~100)
          </Label>
          <Input
            id="setting-queue-max"
            inputMode="numeric"
            value={form.maxQueue}
            onChange={(event) => setForm({ ...form, maxQueue: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="setting-per-user" className="text-xs text-muted-foreground">
            1인당 신청 곡 수
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="setting-per-user"
              inputMode="numeric"
              disabled={form.unlimited}
              value={form.unlimited ? '' : form.perRequester}
              placeholder={form.unlimited ? '제한 없음' : ''}
              onChange={(event) => setForm({ ...form, perRequester: event.target.value })}
            />
            <div className="flex shrink-0 items-center gap-1.5">
              <Switch
                id="setting-per-user-unlimited"
                checked={form.unlimited}
                onCheckedChange={(unlimited) => setForm({ ...form, unlimited })}
              />
              <Label htmlFor="setting-per-user-unlimited" className="text-xs">
                무제한
              </Label>
            </div>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="setting-max-minutes" className="text-xs text-muted-foreground">
            신청 가능한 최대 길이 (분, 1~60)
          </Label>
          <Input
            id="setting-max-minutes"
            inputMode="numeric"
            value={form.maxMinutes}
            onChange={(event) => setForm({ ...form, maxMinutes: event.target.value })}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              maxPerRequester: form.unlimited ? null : clamp(form.perRequester, 1, 99, 1),
              maxQueueLength: clamp(form.maxQueue, 1, 100, 30),
              maxDurationSeconds: clamp(form.maxMinutes, 1, 60, 10) * 60,
            })
          }
        >
          저장
        </Button>
      </div>
    </div>
  );
}
